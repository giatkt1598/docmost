import {
  compileFormula,
  FormulaCompileError,
  FormulaEvaluator,
} from './formula.engine';

type P = { id: string; name: string; type: string; typeOptions: any };

const NOW = new Date('2026-03-15T10:30:00Z');

const base: P[] = [
  { id: 'p_a', name: 'A', type: 'number', typeOptions: {} },
  { id: 'p_b', name: 'B', type: 'number', typeOptions: {} },
  { id: 'p_t', name: 'Title', type: 'text', typeOptions: {} },
  { id: 'p_l', name: 'Notes', type: 'longText', typeOptions: {} },
  { id: 'p_d', name: 'Due', type: 'date', typeOptions: {} },
  { id: 'p_d2', name: 'Start', type: 'date', typeOptions: {} },
  { id: 'p_c', name: 'Done', type: 'checkbox', typeOptions: {} },
  {
    id: 'p_s',
    name: 'Status',
    type: 'status',
    typeOptions: {
      choices: [
        { id: 'c1', name: 'Todo', color: 'gray' },
        { id: 'c2', name: 'Done', color: 'green' },
      ],
    },
  },
  {
    id: 'p_m',
    name: 'Tags',
    type: 'multiSelect',
    typeOptions: {
      choices: [
        { id: 't1', name: 'red', color: 'red' },
        { id: 't2', name: 'blue', color: 'blue' },
      ],
    },
  },
  { id: 'p_u', name: 'Owner', type: 'person', typeOptions: {} },
  {
    id: 'p_us',
    name: 'Owners',
    type: 'person',
    typeOptions: { allowMultiple: true },
  },
  { id: 'p_f', name: 'Files', type: 'file', typeOptions: {} },
  { id: 'p_pg', name: 'Page', type: 'page', typeOptions: {} },
  { id: 'p_ca', name: 'Created', type: 'createdAt', typeOptions: {} },
  { id: 'p_ea', name: 'Edited', type: 'lastEditedAt', typeOptions: {} },
  { id: 'p_eb', name: 'Editor', type: 'lastEditedBy', typeOptions: {} },
];

function formulaProp(id: string, name: string, source: string, others: P[]): P {
  const opts = compileFormula(source, others, id);
  return { id, name, type: 'formula', typeOptions: opts };
}

const ROW = {
  createdAt: new Date('2024-05-06T00:00:00Z'),
  updatedAt: '2024-05-08T12:00:00.000Z',
  lastEditedBy: 'user-2',
};

// Compiles `source` against the base and evaluates it for one row.
function run(
  source: string,
  cells: Record<string, unknown> = {},
  props = base,
) {
  const f = formulaProp('f', 'F', source, props);
  const ev = new FormulaEvaluator([...props, f], NOW);
  return ev.evaluateRow({ cells, ...ROW }, ['f']).f;
}

const err = (message?: string | RegExp) =>
  expect.objectContaining({
    __err:
      message === undefined
        ? expect.any(String)
        : expect.stringMatching(message),
  });

describe('compileFormula', () => {
  it('resolves property names to ids and finds the result type', () => {
    const out = compileFormula('prop("A") + prop("B")', base, null);
    expect(out.dependencies).toEqual(['p_a', 'p_b']);
    expect(out.resultType).toBe('number');
    expect(out.source).toBe('prop("A") + prop("B")');
    expect(out.ast).toBeDefined();
  });

  it('rejects empty sources, unknown properties and bad syntax', () => {
    expect(() => compileFormula('  ', base, null)).toThrow(FormulaCompileError);
    expect(() => compileFormula(undefined as any, base, null)).toThrow(
      FormulaCompileError,
    );
    expect(() => compileFormula('prop("Nope")', base, null)).toThrow(
      FormulaCompileError,
    );
    expect(() => compileFormula('1 +', base, null)).toThrow(
      FormulaCompileError,
    );
  });

  it('detects cycles', () => {
    const f1 = formulaProp('f1', 'F1', 'prop("A") * 2', base);
    const f2 = formulaProp('f2', 'F2', 'prop("F1") + 1', [...base, f1]);
    expect(() => compileFormula('prop("F2")', [...base, f1, f2], 'f1')).toThrow(
      /cycle/i,
    );
  });
});

describe('FormulaEvaluator', () => {
  it('evaluates formulas for a row, including nested ones', () => {
    const f1 = formulaProp('f1', 'Double', 'prop("A") * 2', base);
    const f2 = formulaProp('f2', 'Plus', 'prop("Double") + prop("B")', [
      ...base,
      f1,
    ]);
    const ev = new FormulaEvaluator([...base, f1, f2]);
    const out = ev.evaluateRow(
      { cells: { p_a: 4, p_b: 1 } },
      ev.allFormulaIds(),
    );
    expect(out).toEqual({ f1: 8, f2: 9 });
  });

  it('computes referenced formulas even when only the outer one is asked', () => {
    const f1 = formulaProp('f1', 'Double', 'prop("A") * 2', base);
    const f2 = formulaProp('f2', 'Plus', 'prop("Double") + 1', [...base, f1]);
    const ev = new FormulaEvaluator([...base, f1, f2]);
    // the stored f1 cell is stale; it is recomputed, not read
    expect(ev.evaluateRow({ cells: { p_a: 5, f1: 100 } }, ['f2'])).toEqual({
      f2: 11,
    });
  });

  it('returns null for missing inputs and error cells for division by zero', () => {
    const f = formulaProp('f1', 'Ratio', 'prop("A") / prop("B")', base);
    const ev = new FormulaEvaluator([...base, f]);
    expect(ev.evaluateRow({ cells: { p_a: 1 } }, ['f1']).f1).toBeNull();
    expect(ev.evaluateRow({ cells: { p_a: 1, p_b: 0 } }, ['f1']).f1).toEqual({
      __err: 'Division by zero',
    });
  });

  it('propagates errors to formulas that read an erroring formula', () => {
    const f1 = formulaProp('f1', 'Ratio', 'prop("A") / prop("B")', base);
    const f2 = formulaProp('f2', 'Label', '"r=" + prop("Ratio")', [
      ...base,
      f1,
    ]);
    const ev = new FormulaEvaluator([...base, f1, f2]);
    expect(ev.evaluateRow({ cells: { p_a: 1, p_b: 0 } }, ['f1', 'f2'])).toEqual(
      {
        f1: { __err: 'Division by zero' },
        f2: { __err: 'Division by zero' },
      },
    );
  });

  it('finds the formulas a changed property affects, in order', () => {
    const f1 = formulaProp('f1', 'Double', 'prop("A") * 2', base);
    const f2 = formulaProp('f2', 'Plus', 'prop("Double") + 1', [...base, f1]);
    const f3 = formulaProp('f3', 'Other', 'prop("B") + 1', base);
    const ev = new FormulaEvaluator([...base, f2, f1, f3]);
    expect(ev.affected(['p_a'])).toEqual(['f1', 'f2']);
    expect(ev.affected(['p_a', 'p_b'])).toEqual(['f1', 'f2', 'f3']);
    expect(ev.affected(['p_t'])).toEqual([]);
    expect(ev.allFormulaIds()).toEqual(['f1', 'f2', 'f3']);
    expect(ev.graph.dependents('p_a')).toEqual(['f1', 'f2']);
    expect(ev.graph.affectedFormulas(['f1'])).toEqual(['f2']);
    expect(ev.hasFormulas()).toBe(true);
    expect(new FormulaEvaluator(base).hasFormulas()).toBe(false);
  });

  it('exposes system properties to formulas', () => {
    expect(run('dateAdd(prop("Created"), 1, "days")')).toBe(
      '2024-05-07T00:00:00.000Z',
    );
    expect(run('prop("Edited")')).toBe('2024-05-08T12:00:00.000Z');
    expect(run('toText(prop("Editor"))')).toBe('user-2');
    expect(run('length(prop("Editor"))')).toBe(1);
  });

  it('skips ids that are not formulas', () => {
    const ev = new FormulaEvaluator(base);
    expect(ev.evaluateRow({ cells: {} }, ['p_a', 'missing'])).toEqual({});
  });

  it('turns stored formulas from an older engine into error cells', () => {
    const legacy: P = {
      id: 'f_old',
      name: 'Old',
      type: 'formula',
      typeOptions: {
        source: 'add(prop("A"), 1)',
        ast: { type: 'call', name: 'add' },
        astVersion: 1,
        resultType: 'number',
        dependencies: ['p_a'],
      },
    };
    const empty: P = {
      id: 'f_empty',
      name: 'E',
      type: 'formula',
      typeOptions: {},
    };
    const ev = new FormulaEvaluator([...base, legacy, empty]);
    expect(ev.affected(['p_a'])).toEqual(['f_old']);
    expect(ev.evaluateRow({ cells: { p_a: 1 } }, ['f_old', 'f_empty'])).toEqual(
      {
        f_old: err(/older syntax/),
        f_empty: { __err: 'Formula is empty' },
      },
    );
  });

  it('never throws on corrupted stored trees', () => {
    const broken: P = {
      id: 'fx',
      name: 'X',
      type: 'formula',
      typeOptions: { source: '1', astVersion: 2, ast: { k: 'weird' } },
    };
    const ev = new FormulaEvaluator([...base, broken]);
    expect(ev.evaluateRow({ cells: {} }, ['fx']).fx).toEqual(err());
  });

  it('reports deleted references and changed result types', () => {
    const f = formulaProp('f1', 'Double', 'prop("A") * 2', base);
    const withoutA = base.filter((p) => p.id !== 'p_a');
    const ev = new FormulaEvaluator([...withoutA, f]);
    expect(ev.evaluateRow({ cells: {} }, ['f1']).f1).toEqual({
      __err: 'A referenced property was deleted',
    });

    // A became a text property after the formula was saved
    const g = formulaProp('g', 'Same', 'if(true, prop("A"), 0)', base);
    const retyped = base.map((p) =>
      p.id === 'p_a' ? { ...p, type: 'text' } : p,
    );
    const ev2 = new FormulaEvaluator([...retyped, g]);
    expect(ev2.evaluateRow({ cells: { p_a: 'abc' } }, ['g']).g).toEqual(
      err(/now returns a text instead of a number/),
    );
    const h = formulaProp('h', 'Times', 'prop("A") * 2', base);
    const ev3 = new FormulaEvaluator([...retyped, h]);
    expect(ev3.evaluateRow({ cells: { p_a: 'abc' } }, ['h']).h).toEqual(
      err(/expects a number, got a text/),
    );
  });

  it('reports a runtime cycle in corrupted data instead of looping', () => {
    const a: P = {
      id: 'fa',
      name: 'FA',
      type: 'formula',
      typeOptions: {
        source: 'x',
        astVersion: 2,
        resultType: 'number',
        dependencies: ['fb'],
        ast: { k: 'prop', id: 'fb' },
      },
    };
    const b: P = {
      ...a,
      id: 'fb',
      name: 'FB',
      typeOptions: {
        ...a.typeOptions,
        dependencies: ['fa'],
        ast: { k: 'prop', id: 'fa' },
      },
    };
    const ev = new FormulaEvaluator([a, b]);
    expect(ev.allFormulaIds().sort()).toEqual(['fa', 'fb']);
    expect(ev.evaluateRow({ cells: {} }, ['fa', 'fb'])).toEqual({
      fa: { __err: 'Formula cycle' },
      fb: { __err: 'Formula cycle' },
    });
  });
});

describe('property values', () => {
  it('reads each property type', () => {
    expect(run('prop("Title")', { p_t: 'Hello' })).toBe('Hello');
    expect(run('prop("Notes")', { p_l: 'Long' })).toBe('Long');
    expect(run('prop("A")', { p_a: 2.5 })).toBe(2.5);
    expect(run('prop("Done")', { p_c: true })).toBe(true);
    expect(run('prop("Done")', {})).toBe(false);
    expect(run('prop("Due")', { p_d: '2024-01-02' })).toBe(
      '2024-01-02T00:00:00.000Z',
    );
    expect(run('prop("Status")', { p_s: 'c2' })).toBe('Done');
    expect(run('prop("Status")', { p_s: 'gone' })).toBeNull();
    expect(run('toText(prop("Tags"))', { p_m: ['t2', 'zz', 't1'] })).toBe(
      'blue, red',
    );
    expect(run('toText(prop("Owner"))', { p_u: 'u1' })).toBe('u1');
    expect(run('length(prop("Owners"))', { p_us: ['u1', 'u2'] })).toBe(2);
    expect(
      run('toText(prop("Files"))', {
        p_f: [
          { id: 'f1', fileName: 'a.pdf' },
          { id: 'f2', fileName: '' },
        ],
      }),
    ).toBe('a.pdf, f2');
    expect(run('toText(prop("Page"))', { p_pg: 'page-1' })).toBe('page-1');
  });

  it('treats absent and blank cells as empty', () => {
    expect(run('empty(prop("Title"))', {})).toBe(true);
    expect(run('empty(prop("Title"))', { p_t: '' })).toBe(true);
    expect(run('empty(prop("A"))', {})).toBe(true);
    expect(run('empty(prop("A"))', { p_a: 0 })).toBe(false);
    expect(run('empty(prop("Tags"))', { p_m: [] })).toBe(true);
    expect(run('empty(prop("Owner"))', {})).toBe(true);
    expect(run('empty(prop("Due"))', { p_d: 'not a date' })).toBe(true);
    expect(run('prop("Title")', { p_t: '' })).toBeNull();
  });
});

describe('operators', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 - 4 - 3', 3],
    ['7 / 2', 3.5],
    ['7 % 4', 3],
    ['-7 % 4', -3],
    ['-(2 + 3)', -5],
    ['0.1 + 0.2', 0.3],
    ['"a" + "b"', 'ab'],
    ['"n=" + 2', 'n=2'],
    ['1 + "x"', '1x'],
    ['"ok: " + true', 'ok: true'],
    ['1 < 2', true],
    ['2 <= 2', true],
    ['3 > 4', false],
    ['3 >= 4', false],
    ['"a" < "b"', true],
    ['1 == 1', true],
    ['1 != 1', false],
    ['"a" == "a"', true],
    ['true == false', false],
    ['!true', false],
    ['true && false', false],
    ['true || false', true],
    ['!false && true || false', true],
  ])('%s = %j', (src, expected) => {
    expect(run(src)).toEqual(expected);
  });

  it('handles empty operands', () => {
    expect(run('prop("A") + 1', {})).toBeNull();
    expect(run('prop("A") * 2', {})).toBeNull();
    expect(run('-prop("A")', {})).toBeNull();
    expect(run('"x" + prop("Title")', {})).toBe('x');
    expect(run('prop("A") > 1', {})).toBe(false);
    expect(run('prop("A") == prop("B")', {})).toBe(true);
    expect(run('prop("A") == 1', {})).toBe(false);
    expect(run('prop("A") != 1', {})).toBe(true);
  });

  it('compares dates', () => {
    const cells = { p_d: '2024-01-02', p_d2: '2024-01-01' };
    expect(run('prop("Due") > prop("Start")', cells)).toBe(true);
    expect(run('prop("Due") == prop("Due")', cells)).toBe(true);
  });

  it('short-circuits && and ||', () => {
    expect(run('false && 1 / 0 > 1')).toBe(false);
    expect(run('true || 1 / 0 > 1')).toBe(true);
  });

  it('reports runtime errors', () => {
    expect(run('1 / 0')).toEqual({ __err: 'Division by zero' });
    expect(run('5 % 0')).toEqual({ __err: 'Division by zero' });
    expect(run('prop("A") / 0', { p_a: 1 })).toEqual({
      __err: 'Division by zero',
    });
  });
});

describe('functions', () => {
  describe('logic', () => {
    it('if', () => {
      expect(run('if(prop("A") > 1, "big", "small")', { p_a: 2 })).toBe('big');
      expect(run('if(prop("A") > 1, "big", "small")', {})).toBe('small');
      expect(run('if(prop("Done"), 1, 1 / 0)', { p_c: true })).toBe(1);
    });

    it('ifs', () => {
      const src = 'ifs(prop("A") > 10, "high", prop("A") > 5, "mid", "low")';
      expect(run(src, { p_a: 11 })).toBe('high');
      expect(run(src, { p_a: 6 })).toBe('mid');
      expect(run(src, { p_a: 1 })).toBe('low');
    });

    it('and / or / not', () => {
      expect(run('and(true, true, 1 < 2)')).toBe(true);
      expect(run('and(true, false)')).toBe(false);
      expect(run('and(false, 1 / 0 > 1)')).toBe(false);
      expect(run('or(false, false)')).toBe(false);
      expect(run('or(false, true)')).toBe(true);
      expect(run('not(true)')).toBe(false);
      expect(run('not(prop("Done"))', {})).toBe(true);
    });

    it('empty', () => {
      expect(run('empty("")')).toBe(true);
      expect(run('empty("  ")')).toBe(true);
      expect(run('empty("a")')).toBe(false);
      expect(run('empty(0)')).toBe(false);
      expect(run('empty(false)')).toBe(false);
    });
  });

  describe('text', () => {
    it('concat', () => {
      expect(run('concat("a", 1, true, prop("Title"))', {})).toBe('a1true');
      expect(run('concat(prop("Tags"), "!")', { p_m: ['t1'] })).toBe('red!');
    });

    it('length', () => {
      expect(run('length("héllo")')).toBe(5);
      expect(run('length(prop("Title"))', {})).toBe(0);
      expect(run('length(prop("Tags"))', { p_m: ['t1', 't2'] })).toBe(2);
    });

    it('lower / upper / trim', () => {
      expect(run('lower("AbC")')).toBe('abc');
      expect(run('upper("AbC")')).toBe('ABC');
      expect(run('trim("  x  ")')).toBe('x');
      expect(run('upper(prop("Title"))', {})).toBeNull();
    });

    it('contains', () => {
      expect(run('contains("hello", "ell")')).toBe(true);
      expect(run('contains("hello", "L")')).toBe(false);
      expect(run('contains(prop("Tags"), "blue")', { p_m: ['t2'] })).toBe(true);
      expect(run('contains(prop("Tags"), "red")', { p_m: ['t2'] })).toBe(false);
      expect(run('contains(prop("Title"), "a")', {})).toBe(false);
    });

    it('replace', () => {
      expect(run('replace("a-b-c", "-", "+")')).toBe('a+b+c');
      expect(run('replace("abc", "", "x")')).toBe('abc');
      expect(run('replace(prop("Title"), "a", "b")', {})).toBeNull();
    });

    it('toText', () => {
      expect(run('toText(1.5)')).toBe('1.5');
      expect(run('toText(0.1 + 0.2)')).toBe('0.3');
      expect(run('toText(true)')).toBe('true');
      expect(run('toText(prop("Due"))', { p_d: '2024-01-02' })).toBe(
        '2024-01-02',
      );
      expect(run('toText(prop("Due"))', { p_d: '2024-01-02T09:05:00Z' })).toBe(
        '2024-01-02 09:05',
      );
      expect(run('toText(prop("Title"))', {})).toBeNull();
    });

    it('limits text size', () => {
      const big = 'x'.repeat(26000);
      const props: P[] = [
        ...base,
        { id: 'p_big', name: 'Big', type: 'longText', typeOptions: {} },
      ];
      expect(run('prop("Big") + "!"', { p_big: big }, props)).toEqual(
        err(/too long/),
      );
    });
  });

  describe('number', () => {
    it('round', () => {
      expect(run('round(2.5)')).toBe(3);
      expect(run('round(-2.5)')).toBe(-3);
      expect(run('round(1.005, 2)')).toBe(1.01);
      expect(run('round(1234, -2)')).toBe(1200);
      expect(run('round(prop("A"))', {})).toBeNull();
      expect(run('round(1.5, 0.5)')).toEqual(err(/whole number/));
    });

    it('floor / ceil / abs', () => {
      expect(run('floor(1.7)')).toBe(1);
      expect(run('floor(-1.2)')).toBe(-2);
      expect(run('ceil(1.2)')).toBe(2);
      expect(run('abs(-3)')).toBe(3);
      expect(run('abs(prop("A"))', {})).toBeNull();
    });

    it('min / max / sum', () => {
      expect(run('min(3, 1, 2)')).toBe(1);
      expect(run('max(3, 1, 2)')).toBe(3);
      expect(run('sum(1, 2, 3.5)')).toBe(6.5);
      expect(run('min(prop("A"), 4)', {})).toBe(4);
      expect(run('max(prop("A"), prop("B"))', {})).toBeNull();
      expect(run('sum(prop("A"), prop("B"))', {})).toBe(0);
    });

    it('toNumber', () => {
      expect(run('toNumber("42")')).toBe(42);
      expect(run('toNumber(" 1.5 ")')).toBe(1.5);
      expect(run('toNumber(true)')).toBe(1);
      expect(run('toNumber(false)')).toBe(0);
      expect(run('toNumber(7)')).toBe(7);
      expect(
        run('toNumber(prop("Due"))', { p_d: '1970-01-01T00:00:01Z' }),
      ).toBe(1000);
      expect(run('toNumber(prop("Title"))', {})).toBeNull();
      expect(run('toNumber("abc")')).toEqual({
        __err: 'toNumber(): cannot convert "abc" to a number',
      });
    });

    it('rejects non-finite results', () => {
      expect(run('toNumber("1e308") * 10')).toEqual(err(/finite/));
    });
  });

  describe('date', () => {
    it('now / today', () => {
      expect(run('now()')).toBe('2026-03-15T10:30:00.000Z');
      expect(run('today()')).toBe('2026-03-15T00:00:00.000Z');
    });

    it('dateAdd', () => {
      const cells = { p_d: '2024-01-31T00:00:00Z' };
      expect(run('dateAdd(prop("Due"), 1, "months")', cells)).toBe(
        '2024-02-29T00:00:00.000Z',
      );
      expect(run('dateAdd(prop("Due"), 1, "years")', cells)).toBe(
        '2025-01-31T00:00:00.000Z',
      );
      expect(run('dateAdd(prop("Due"), -2, "weeks")', cells)).toBe(
        '2024-01-17T00:00:00.000Z',
      );
      expect(run('dateAdd(prop("Due"), 3, "hours")', cells)).toBe(
        '2024-01-31T03:00:00.000Z',
      );
      expect(run('dateAdd(prop("Due"), 90, "minutes")', cells)).toBe(
        '2024-01-31T01:30:00.000Z',
      );
      expect(run('dateAdd(prop("Due"), 1, "day")', cells)).toBe(
        '2024-02-01T00:00:00.000Z',
      );
      expect(run('dateAdd(prop("Due"), 1, "days")', {})).toBeNull();
      expect(
        run('dateAdd(prop("Due"), 1, prop("Title"))', {
          ...cells,
          p_t: 'eons',
        }),
      ).toEqual(err(/unknown unit "eons"/));
      expect(
        run('dateAdd(prop("Due"), prop("A"), "years")', {
          ...cells,
          p_a: 1e20,
        }),
      ).toEqual(err(/Invalid date/));
    });

    it('dateBetween', () => {
      const cells = {
        p_d: '2024-03-10T12:00:00Z',
        p_d2: '2024-01-15T00:00:00Z',
      };
      expect(
        run('dateBetween(prop("Due"), prop("Start"), "days")', cells),
      ).toBe(55);
      expect(
        run('dateBetween(prop("Start"), prop("Due"), "days")', cells),
      ).toBe(-55);
      expect(
        run('dateBetween(prop("Due"), prop("Start"), "weeks")', cells),
      ).toBe(7);
      expect(
        run('dateBetween(prop("Due"), prop("Start"), "months")', cells),
      ).toBe(1);
      expect(
        run('dateBetween(prop("Due"), prop("Start"), "years")', cells),
      ).toBe(0);
      expect(
        run('dateBetween(prop("Due"), prop("Start"), "hours")', cells),
      ).toBe(1332);
      expect(
        run('dateBetween(prop("Due"), prop("Start"), "minutes")', cells),
      ).toBe(79920);
      expect(
        run('dateBetween(prop("Due"), prop("Start"), "days")', {}),
      ).toBeNull();
    });

    it('formatDate', () => {
      const cells = { p_d: '2026-10-05T09:07:03Z' };
      expect(run('formatDate(prop("Due"), "DD/MM/YYYY")', cells)).toBe(
        '05/10/2026',
      );
      expect(
        run('formatDate(prop("Due"), "dddd, D MMMM YYYY h:mm A")', cells),
      ).toBe('Monday, 5 October 2026 9:07 AM');
      expect(run('formatDate(prop("Due"), "[Day] D")', cells)).toBe('Day 5');
      expect(run('formatDate(prop("Due"), "YYYY")', {})).toBeNull();
    });

    it('year / month / day', () => {
      const cells = { p_d: '2026-10-05T09:07:03Z' };
      expect(run('year(prop("Due"))', cells)).toBe(2026);
      expect(run('month(prop("Due"))', cells)).toBe(10);
      expect(run('day(prop("Due"))', cells)).toBe(5);
      expect(run('year(prop("Due"))', {})).toBeNull();
    });
  });
});
