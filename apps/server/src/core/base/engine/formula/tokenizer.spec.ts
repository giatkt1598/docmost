import { tokenize } from './tokenizer';
import { FormulaCompileError } from './types';

const kinds = (src: string) => tokenize(src).map((t) => t.type);
const texts = (src: string) =>
  tokenize(src)
    .filter((t) => t.type !== 'eof')
    .map((t) => t.text);

describe('tokenize', () => {
  it('reads numbers, identifiers and punctuation with positions', () => {
    const tokens = tokenize('round(3.5, 2)');
    expect(tokens.map((t) => [t.type, t.text, t.start, t.end])).toEqual([
      ['ident', 'round', 0, 5],
      ['lparen', '(', 5, 6],
      ['number', '3.5', 6, 9],
      ['comma', ',', 9, 10],
      ['number', '2', 11, 12],
      ['rparen', ')', 12, 13],
      ['eof', '', 13, 13],
    ]);
    expect(tokens[2].value).toBe(3.5);
  });

  it('reads numbers starting with a dot', () => {
    expect(tokenize('.5')[0]).toMatchObject({ type: 'number', value: 0.5 });
  });

  it('reads both quote styles and decodes escapes', () => {
    const [a, b] = tokenize(`"say \\"hi\\"\\n" 'it\\'s'`);
    expect(a).toMatchObject({ type: 'string', value: 'say "hi"\n' });
    expect(b).toMatchObject({ type: 'string', value: "it's" });
    expect(tokenize(`"a\\\\b\\tc\\qd"`)[0].value).toBe('a\\b\tcqd');
  });

  it('keeps the other quote inside a string', () => {
    expect(tokenize(`"it's"`)[0].value).toBe("it's");
    expect(tokenize(`'say "x"'`)[0].value).toBe('say "x"');
  });

  it('reads one and two character operators', () => {
    expect(texts('a<=b>=c==d!=e&&f||g<h>i+j-k*l/m%n!o')).toEqual([
      'a',
      '<=',
      'b',
      '>=',
      'c',
      '==',
      'd',
      '!=',
      'e',
      '&&',
      'f',
      '||',
      'g',
      '<',
      'h',
      '>',
      'i',
      '+',
      'j',
      '-',
      'k',
      '*',
      'l',
      '/',
      'm',
      '%',
      'n',
      '!',
      'o',
    ]);
  });

  it('skips whitespace including newlines', () => {
    expect(kinds(' 1 \n+\t2\r\n')).toEqual(['number', 'op', 'number', 'eof']);
  });

  it.each([
    ['"abc', /Unterminated text/],
    ["'abc\\'", /Unterminated text/],
    ['1 = 2', /Use == to compare/],
    ['a & b', /Use && for/],
    ['a | b', /Use \|\| for/],
    ['1 # 2', /Unexpected character "#" at position 3/],
    ['“hi”', /straight quotes/],
    ['1.', /Invalid number/],
    ['1.2.3', /Invalid number/],
    ['12abc', /Invalid number/],
  ])('rejects %s', (src, message) => {
    expect(() => tokenize(src)).toThrow(FormulaCompileError);
    expect(() => tokenize(src)).toThrow(message);
  });

  it('reports syntax errors with the SYNTAX code', () => {
    let caught: unknown;
    try {
      tokenize('@');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FormulaCompileError);
    expect((caught as FormulaCompileError).code).toBe('SYNTAX');
  });
});
