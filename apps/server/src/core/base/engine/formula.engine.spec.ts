import {
  compileFormula,
  FormulaCompileError,
  FormulaEvaluator,
} from './formula.engine';

type P = { id: string; name: string; type: string; typeOptions: any };

const base: P[] = [
  { id: 'p_a', name: 'A', type: 'number', typeOptions: {} },
  { id: 'p_b', name: 'B', type: 'number', typeOptions: {} },
  { id: 'p_t', name: 'Title', type: 'text', typeOptions: {} },
];

function formulaProp(id: string, name: string, source: string, others: P[]): P {
  const opts = compileFormula(source, others, id);
  return { id, name, type: 'formula', typeOptions: opts };
}

describe('compileFormula', () => {
  it('resolves property names to ids and finds the result type', () => {
    const out = compileFormula('prop("A") + prop("B")', base, null);
    expect(out.dependencies).toEqual(['p_a', 'p_b']);
    expect(out.resultType).toBe('number');
    expect(out.astVersion).toBe(1);
  });

  it('rejects empty sources, unknown properties and bad syntax', () => {
    expect(() => compileFormula('  ', base, null)).toThrow(FormulaCompileError);
    expect(() => compileFormula('prop("Nope")', base, null)).toThrow(FormulaCompileError);
    expect(() => compileFormula('1 +', base, null)).toThrow(FormulaCompileError);
  });

  it('detects cycles', () => {
    const f1 = formulaProp('f1', 'F1', 'prop("A") * 2', base);
    const f2 = formulaProp('f2', 'F2', 'prop("F1") + 1', [...base, f1]);
    expect(() =>
      compileFormula('prop("F2")', [...base, f1, f2], 'f1'),
    ).toThrow(/cycle/i);
  });
});

describe('FormulaEvaluator', () => {
  it('evaluates formulas for a row, including nested ones', () => {
    const f1 = formulaProp('f1', 'Double', 'prop("A") * 2', base);
    const f2 = formulaProp('f2', 'Plus', 'prop("Double") + prop("B")', [...base, f1]);
    const ev = new FormulaEvaluator([...base, f1, f2]);
    const out = ev.evaluateRow({ cells: { p_a: 4, p_b: 1 } }, ev.allFormulaIds());
    expect(out).toEqual({ f1: 8, f2: 9 });
  });

  it('returns null for missing inputs and error cells for division by zero', () => {
    const f = formulaProp('f1', 'Ratio', 'prop("A") / prop("B")', base);
    const ev = new FormulaEvaluator([...base, f]);
    expect(ev.evaluateRow({ cells: { p_a: 1 } }, ['f1']).f1).toBeNull();
    expect(ev.evaluateRow({ cells: { p_a: 1, p_b: 0 } }, ['f1']).f1).toMatchObject({
      __err: expect.any(String),
    });
  });

  it('finds the formulas a changed property affects, in order', () => {
    const f1 = formulaProp('f1', 'Double', 'prop("A") * 2', base);
    const f2 = formulaProp('f2', 'Plus', 'prop("Double") + 1', [...base, f1]);
    const f3 = formulaProp('f3', 'Other', 'prop("B") + 1', base);
    const ev = new FormulaEvaluator([...base, f2, f1, f3]);
    expect(ev.affected(['p_a'])).toEqual(['f1', 'f2']);
    expect(ev.affected(['p_t'])).toEqual([]);
  });

  it('exposes system properties to formulas', () => {
    const sys: P[] = [
      ...base,
      { id: 'p_c', name: 'Created', type: 'createdAt', typeOptions: {} },
    ];
    const f = formulaProp('f1', 'Next', 'dateAdd(prop("Created"), 1, "days")', sys);
    const ev = new FormulaEvaluator([...sys, f]);
    const out = ev.evaluateRow(
      { cells: {}, createdAt: new Date('2024-05-06T00:00:00Z') },
      ['f1'],
    );
    expect(out.f1).toBe('2024-05-07T00:00:00.000Z');
  });
});
