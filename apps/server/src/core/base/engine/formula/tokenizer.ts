import { FormulaCompileError } from './types';

export type TokenType =
  | 'number'
  | 'string'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eof';

export type Token = {
  type: TokenType;
  // operator text, identifier text or the raw literal text
  text: string;
  // decoded value of number and string literals
  value?: number | string;
  // offsets into the source, end exclusive
  start: number;
  end: number;
};

export const MAX_FORMULA_LENGTH = 4000;

const TWO_CHAR_OPS = new Set(['<=', '>=', '==', '!=', '&&', '||']);
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '<', '>', '!']);

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '\\': '\\',
  '"': '"',
  "'": "'",
};

function isDigit(c: string) {
  return c >= '0' && c <= '9';
}

function isIdentStart(c: string) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isIdentPart(c: string) {
  return isIdentStart(c) || isDigit(c);
}

function syntax(message: string): never {
  throw new FormulaCompileError(message, 'SYNTAX');
}

// Splits a formula source into tokens. Positions in error messages are
// 1-based character columns.
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
      const start = i;
      while (i < n && isDigit(source[i])) i++;
      if (source[i] === '.') {
        i++;
        if (!isDigit(source[i] ?? '')) {
          syntax(`Invalid number at position ${start + 1}`);
        }
        while (i < n && isDigit(source[i])) i++;
      }
      if (isIdentStart(source[i] ?? '') || source[i] === '.') {
        syntax(`Invalid number at position ${start + 1}`);
      }
      const text = source.slice(start, i);
      tokens.push({ type: 'number', text, value: Number(text), start, end: i });
      continue;
    }

    if (c === '"' || c === "'") {
      const start = i;
      const quote = c;
      let value = '';
      i++;
      let closed = false;
      while (i < n) {
        const ch = source[i];
        if (ch === quote) {
          closed = true;
          i++;
          break;
        }
        if (ch === '\\') {
          const next = source[i + 1];
          if (next === undefined) break;
          value += ESCAPES[next] ?? next;
          i += 2;
          continue;
        }
        value += ch;
        i++;
      }
      if (!closed)
        syntax(`Unterminated text starting at position ${start + 1}`);
      tokens.push({
        type: 'string',
        text: source.slice(start, i),
        value,
        start,
        end: i,
      });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(source[i])) i++;
      const text = source.slice(start, i);
      tokens.push({ type: 'ident', text, start, end: i });
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ type: 'op', text: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ type: 'op', text: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      const type = c === '(' ? 'lparen' : c === ')' ? 'rparen' : 'comma';
      tokens.push({ type, text: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '=') syntax(`Use == to compare values (position ${i + 1})`);
    if (c === '&') syntax(`Use && for "and" (position ${i + 1})`);
    if (c === '|') syntax(`Use || for "or" (position ${i + 1})`);
    if (c === '“' || c === '”' || c === '‘' || c === '’') {
      syntax(`Use straight quotes " or ' for text (position ${i + 1})`);
    }
    syntax(`Unexpected character "${c}" at position ${i + 1}`);
  }

  tokens.push({ type: 'eof', text: '', start: n, end: n });
  return tokens;
}
