import { compileFormulaSource, NamedProperty } from './compiler';
import { formulaTypeOfProperty } from './type-checker';
import { FORMULA_AST_VERSION, FormulaCompileError } from './types';

const props: NamedProperty[] = [
  { id: 'n', name: 'Price', type: 'number', typeOptions: {} },
  { id: 'q', name: 'Qty', type: 'number', typeOptions: {} },
  { id: 't', name: 'Title', type: 'text', typeOptions: {} },
  { id: 'd', name: 'Due', type: 'date', typeOptions: {} },
  { id: 'c', name: 'Done', type: 'checkbox', typeOptions: {} },
  { id: 's', name: 'Status', type: 'status', typeOptions: { choices: [] } },
  { id: 'm', name: 'Tags', type: 'multiSelect', typeOptions: { choices: [] } },
  { id: 'u', name: 'Owner', type: 'person', typeOptions: {} },
  {
    id: 'old',
    name: 'Legacy',
    type: 'formula',
    typeOptions: { resultType: 'string' },
  },
  { id: 'unk', name: 'Unknown', type: 'formula', typeOptions: {} },
];

const compile = (src: string, list = props, selfId: string | null = null) =>
  compileFormulaSource(src, list, selfId);

function errorOf(src: string, list = props, selfId: string | null = null) {
  try {
    compile(src, list, selfId);
  } catch (e) {
    expect(e).toBeInstanceOf(FormulaCompileError);
    return {
      code: (e as FormulaCompileError).code,
      message: (e as Error).message,
    };
  }
  throw new Error(`expected "${src}" to fail`);
}

describe('compileFormulaSource', () => {
  it('returns the stored typeOptions shape', () => {
    const out = compile('prop("Price") * prop("Qty") + prop("Price")');
    expect(out).toEqual({
      source: 'prop("Price") * prop("Qty") + prop("Price")',
      resultType: 'number',
      dependencies: ['n', 'q'],
      astVersion: FORMULA_AST_VERSION,
      ast: {
        k: 'binary',
        op: '+',
        left: {
          k: 'binary',
          op: '*',
          left: { k: 'prop', id: 'n' },
          right: { k: 'prop', id: 'q' },
        },
        right: { k: 'prop', id: 'n' },
      },
    });
  });

  it('keeps format options when given as an object', () => {
    expect(
      compileFormulaSource('1', props, null, { format: 'percent' })
        .formatOptions,
    ).toEqual({ format: 'percent' });
    expect(
      compileFormulaSource('1', props, null, 'x' as any).formatOptions,
    ).toBeUndefined();
  });

  it('resolves names exactly first, then ignoring case and spaces', () => {
    expect(compile('prop("price")').dependencies).toEqual(['n']);
    expect(compile('prop(" Price ")').dependencies).toEqual(['n']);
    const twins: NamedProperty[] = [
      { id: 'a', name: 'abc', type: 'number', typeOptions: {} },
      { id: 'b', name: 'ABC', type: 'text', typeOptions: {} },
    ];
    expect(compile('prop("ABC")', twins).dependencies).toEqual(['b']);
  });

  it.each([
    ['1 + 2', 'number'],
    ['"a" + 1', 'text'],
    ['1 + "a"', 'text'],
    ['prop("Title") + prop("Due")', 'text'],
    ['prop("Done")', 'boolean'],
    ['prop("Price") > 2', 'boolean'],
    ['prop("Due")', 'date'],
    ['prop("Status")', 'text'],
    ['prop("Legacy")', 'text'],
    ['prop("Unknown")', 'text'],
    ['prop("Unknown") + 1', 'number'],
    ['if(prop("Done"), prop("Unknown"), 2)', 'number'],
    ['length(prop("Tags"))', 'number'],
    ['toText(prop("Owner"))', 'text'],
    ['empty(prop("Owner"))', 'boolean'],
    ['contains(prop("Tags"), "x")', 'boolean'],
    ['ifs(prop("Done"), "a", prop("Price") > 1, "b", "c")', 'text'],
    ['dateAdd(prop("Due"), 1, "days")', 'date'],
    ['dateBetween(now(), prop("Due"), "weeks")', 'number'],
  ])('%s has type %s', (src, type) => {
    expect(compile(src).resultType).toBe(type);
  });

  describe('type errors', () => {
    it.each([
      ['"a" * 2', /Operator "\*" expects numbers, got a text and a number/],
      ['"a" - "b"', /expects numbers/],
      ['true + 1', /cannot add a boolean and a number/],
      ['prop("Due") + 1', /Use dateAdd\(\)/],
      ['prop("Due") - prop("Due")', /Use dateBetween\(\)/],
      ['-"a"', /Cannot negate a text/],
      ['!1', /Operator "!" expects a boolean, got a number/],
      ['1 < "a"', /cannot compare a number and a text/],
      ['true < false', /cannot compare booleans/],
      ['1 == "1"', /cannot compare a number and a text/],
      ['1 && true', /expects booleans/],
      ['if(true, 1, "a")', /branches of if\(\) must all have the same type/],
      ['if(1, 2, 3)', /argument 1 must be a boolean, got a number/],
      ['ifs(true, 1, false, "a", 2)', /values of ifs\(\)/],
      ['ifs(1, 2, 3)', /ifs\(\) argument 1 must be a boolean/],
      [
        'round("a")',
        /round\(number, digits\?\): argument 1 must be a number, got a text/,
      ],
      ['upper(1)', /must be a text/],
      ['year("2024")', /must be a date/],
      ['dateAdd(prop("Due"), 1, "fortnights")', /unit must be one of/],
      ['dateBetween(prop("Due"), now(), "eons")', /unit must be one of/],
      ['prop("Tags") + "x"', /cannot be used with a list/],
      ['prop("Owner") == "x"', /cannot be used with a list/],
      ['upper(prop("Owner"))', /must be a text, got a list/],
      ['toNumber(prop("Tags"))', /must be a number, text, boolean or date/],
      ['sum(prop("Tags"))', /must be a number/],
    ])('%s', (src, message) => {
      const err = errorOf(src);
      expect(err.code).toBe('TYPE');
      expect(err.message).toMatch(message);
    });

    it('rejects list results', () => {
      expect(errorOf('prop("Tags")')).toMatchObject({ code: 'RESULT_TYPE' });
      expect(errorOf('if(true, prop("Tags"), prop("Owner"))').code).toBe(
        'RESULT_TYPE',
      );
    });
  });

  describe('function checks', () => {
    it.each([
      ['foo(1)', 'UNKNOWN_FUNCTION', /Unknown function "foo"/],
      ['if(true, 1)', 'ARGUMENTS', /takes 3 arguments, got 2/],
      ['round(1, 2, 3)', 'ARGUMENTS', /takes 1 to 2 arguments, got 3/],
      ['now(1)', 'ARGUMENTS', /takes 0 arguments, got 1/],
      ['not()', 'ARGUMENTS', /takes 1 argument, got 0/],
      ['sum()', 'ARGUMENTS', /takes at least 1 argument/],
      ['ifs(true, 1, 2, 3)', 'ARGUMENTS', /condition\/value pairs/],
    ])('%s', (src, code, message) => {
      const err = errorOf(src);
      expect(err.code).toBe(code);
      expect(err.message).toMatch(message);
    });

    it('accepts function names in any case', () => {
      expect(compile('ROUND(1.5)').resultType).toBe('number');
      expect(compile('DateAdd(now(), 1, "Days")').resultType).toBe('date');
    });
  });

  describe('references', () => {
    it('rejects unknown properties', () => {
      expect(errorOf('prop("Nope") + 1')).toEqual({
        code: 'UNKNOWN_PROPERTY',
        message: 'Unknown property "Nope"',
      });
    });

    it('rejects references to itself', () => {
      const self: NamedProperty = {
        id: 'f',
        name: 'Total',
        type: 'formula',
        typeOptions: {},
      };
      expect(errorOf('prop("Total")', [...props, self], 'f').code).toBe(
        'SELF_REFERENCE',
      );
    });

    it('detects cycles through other formulas, with names', () => {
      const a: NamedProperty = {
        id: 'fa',
        name: 'A',
        type: 'formula',
        typeOptions: compile('prop("Price") * 2'),
      };
      const b: NamedProperty = {
        id: 'fb',
        name: 'B',
        type: 'formula',
        typeOptions: compile('prop("A") + 1', [...props, a]),
      };
      const list = [...props, a, b];
      const err = errorOf('prop("B") + 1', list, 'fa');
      expect(err).toEqual({
        code: 'CYCLE',
        message: 'Formula cycle: A -> B -> A',
      });
      // B itself may still read A
      expect(compile('prop("A") * 3', list, 'fb').dependencies).toEqual(['fa']);
      // a new formula can read both
      expect(compile('prop("A") + prop("B")', list).dependencies).toEqual([
        'fa',
        'fb',
      ]);
    });
  });
});

describe('formulaTypeOfProperty', () => {
  it.each([
    ['text', 'text'],
    ['longText', 'text'],
    ['url', 'text'],
    ['email', 'text'],
    ['select', 'text'],
    ['status', 'text'],
    ['number', 'number'],
    ['checkbox', 'boolean'],
    ['date', 'date'],
    ['createdAt', 'date'],
    ['lastEditedAt', 'date'],
    ['multiSelect', 'list'],
    ['person', 'list'],
    ['file', 'list'],
    ['page', 'list'],
    ['lastEditedBy', 'list'],
    ['bogus', 'empty'],
  ])('%s -> %s', (type, expected) => {
    expect(formulaTypeOfProperty(type)).toBe(expected);
  });

  it('uses the result type of formulas', () => {
    expect(formulaTypeOfProperty('formula', { resultType: 'date' })).toBe(
      'date',
    );
    expect(formulaTypeOfProperty('formula', { resultType: 'string' })).toBe(
      'text',
    );
    expect(formulaTypeOfProperty('formula', { resultType: 'null' })).toBe(
      'empty',
    );
  });
});
