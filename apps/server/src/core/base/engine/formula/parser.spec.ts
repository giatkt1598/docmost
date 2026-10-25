import { MAX_NESTING, parseFormula } from './parser';
import { MAX_FORMULA_LENGTH } from './tokenizer';
import { FormulaCompileError, FormulaNode } from './types';

// Prints an AST fully parenthesized so precedence is easy to assert.
function show(n: FormulaNode): string {
  switch (n.k) {
    case 'num':
      return String(n.v);
    case 'str':
      return JSON.stringify(n.v);
    case 'bool':
      return String(n.v);
    case 'prop':
      return `prop(${n.name ?? n.id})`;
    case 'unary':
      return `(${n.op}${show(n.arg)})`;
    case 'binary':
      return `(${show(n.left)} ${n.op} ${show(n.right)})`;
    case 'call':
      return `${n.fn}(${n.args.map(show).join(', ')})`;
  }
}

const p = (src: string) => show(parseFormula(src));

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as FormulaCompileError).code;
  }
  return 'NO_ERROR';
}

describe('parseFormula', () => {
  it('parses literals', () => {
    expect(parseFormula('12')).toEqual({ k: 'num', v: 12 });
    expect(parseFormula('3.5')).toEqual({ k: 'num', v: 3.5 });
    expect(parseFormula('"hi"')).toEqual({ k: 'str', v: 'hi' });
    expect(parseFormula("'hi'")).toEqual({ k: 'str', v: 'hi' });
    expect(parseFormula('true')).toEqual({ k: 'bool', v: true });
    expect(parseFormula('FALSE')).toEqual({ k: 'bool', v: false });
  });

  it('parses property references by name', () => {
    expect(parseFormula('prop("Due date")')).toEqual({
      k: 'prop',
      name: 'Due date',
    });
    expect(parseFormula("PROP('x')")).toEqual({ k: 'prop', name: 'x' });
  });

  it('parses calls with lower-cased names', () => {
    expect(parseFormula('Concat("a", 1)')).toEqual({
      k: 'call',
      fn: 'concat',
      args: [
        { k: 'str', v: 'a' },
        { k: 'num', v: 1 },
      ],
    });
    expect(parseFormula('now()')).toEqual({ k: 'call', fn: 'now', args: [] });
  });

  describe('precedence', () => {
    it.each([
      ['1 + 2 * 3', '(1 + (2 * 3))'],
      ['1 * 2 + 3', '((1 * 2) + 3)'],
      ['(1 + 2) * 3', '((1 + 2) * 3)'],
      ['10 - 4 - 3', '((10 - 4) - 3)'],
      ['8 / 4 / 2', '((8 / 4) / 2)'],
      ['7 % 4 * 2', '((7 % 4) * 2)'],
      ['-2 * 3', '(-2 * 3)'],
      ['-prop("A") * 3', '((-prop(A)) * 3)'],
      ['- -1', '1'],
      ['!true && false', '((!true) && false)'],
      ['1 + 2 < 4', '((1 + 2) < 4)'],
      ['1 < 2 == true', '((1 < 2) == true)'],
      ['1 == 1 && 2 != 3', '((1 == 1) && (2 != 3))'],
      ['true || false && false', '(true || (false && false))'],
      ['true && false || true', '((true && false) || true)'],
      ['1 <= 2 || 3 >= 4', '((1 <= 2) || (3 >= 4))'],
      ['"a" + "b" + 1', '(("a" + "b") + 1)'],
      ['if(1 > 2, 1 + 1, 3)', 'if((1 > 2), (1 + 1), 3)'],
      ['!(1 < 2)', '(!(1 < 2))'],
      ['((1))', '1'],
    ])('%s', (src, expected) => {
      expect(p(src)).toBe(expected);
    });
  });

  describe('errors', () => {
    it.each([
      ['', 'EMPTY'],
      ['   ', 'EMPTY'],
      ['1 +', 'SYNTAX'],
      ['(1 + 2', 'SYNTAX'],
      ['1 + 2)', 'SYNTAX'],
      ['1 2', 'SYNTAX'],
      ['foo', 'SYNTAX'],
      ['prop(A)', 'SYNTAX'],
      ['prop("A" + "B")', 'SYNTAX'],
      ['prop()', 'SYNTAX'],
      ['round(1,)', 'SYNTAX'],
      ['round(,1)', 'SYNTAX'],
      ['round(1 2)', 'SYNTAX'],
      ['*2', 'SYNTAX'],
      [',', 'SYNTAX'],
    ])('%j -> %s', (src, code) => {
      expect(codeOf(() => parseFormula(src))).toBe(code);
    });

    it('gives positions and helpful messages', () => {
      expect(() => parseFormula('1 + 2)')).toThrow(
        'Unmatched ")" at position 6',
      );
      expect(() => parseFormula('Price * 2')).toThrow(/Use prop\("Name"\)/);
      expect(() => parseFormula('1 +')).toThrow('Formula ends unexpectedly');
      expect(() => parseFormula('(1')).toThrow(/Expected "\)"/);
    });

    it('limits length and nesting', () => {
      expect(
        codeOf(() => parseFormula('1'.repeat(MAX_FORMULA_LENGTH + 1))),
      ).toBe('TOO_LONG');
      const deep =
        '('.repeat(MAX_NESTING + 1) + '1' + ')'.repeat(MAX_NESTING + 1);
      expect(() => parseFormula(deep)).toThrow(/nested too deeply/);
      const ok =
        '('.repeat(MAX_NESTING - 1) + '1' + ')'.repeat(MAX_NESTING - 1);
      expect(parseFormula(ok)).toEqual({ k: 'num', v: 1 });
      expect(() => parseFormula('-'.repeat(MAX_NESTING + 1) + '1')).toThrow(
        /nested too deeply/,
      );
    });

    it('rejects non-string sources', () => {
      expect(codeOf(() => parseFormula(undefined as any))).toBe('EMPTY');
      expect(codeOf(() => parseFormula(42 as any))).toBe('EMPTY');
    });
  });
});
