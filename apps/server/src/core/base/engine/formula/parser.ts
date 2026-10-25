import { MAX_FORMULA_LENGTH, Token, tokenize } from './tokenizer';
import {
  BinaryOperator,
  FormulaCompileError,
  FormulaNode,
  UnaryOperator,
} from './types';

// Grammar (lowest precedence first):
//
//   expr       := or
//   or         := and ( "||" and )*
//   and        := equality ( "&&" equality )*
//   equality   := comparison ( ( "==" | "!=" ) comparison )*
//   comparison := additive ( ( "<" | "<=" | ">" | ">=" ) additive )*
//   additive   := term ( ( "+" | "-" ) term )*
//   term       := unary ( ( "*" | "/" | "%" ) unary )*
//   unary      := ( "-" | "!" ) unary | primary
//   primary    := NUMBER | STRING | "true" | "false"
//               | "prop" "(" STRING ")"
//               | IDENT "(" ( expr ( "," expr )* )? ")"
//               | "(" expr ")"

export const MAX_NESTING = 64;

const LEVELS: BinaryOperator[][] = [
  ['||'],
  ['&&'],
  ['==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
];

function describe(t: Token): string {
  if (t.type === 'eof') return 'end of formula';
  return `"${t.text}"`;
}

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): FormulaNode {
    const node = this.expr();
    const t = this.peek();
    if (t.type !== 'eof') {
      if (t.type === 'rparen') {
        this.fail(`Unmatched ")" at position ${t.start + 1}`);
      }
      this.fail(`Unexpected ${describe(t)} at position ${t.start + 1}`);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private fail(message: string): never {
    throw new FormulaCompileError(message, 'SYNTAX');
  }

  private expect(type: Token['type'], what: string): Token {
    const t = this.peek();
    if (t.type !== type) {
      this.fail(
        `Expected ${what} but found ${describe(t)} at position ${t.start + 1}`,
      );
    }
    return this.next();
  }

  private enter() {
    if (++this.depth > MAX_NESTING) this.fail('Formula is nested too deeply');
  }

  private expr(): FormulaNode {
    return this.binary(0);
  }

  private binary(level: number): FormulaNode {
    if (level >= LEVELS.length) return this.unary();
    const ops = LEVELS[level];
    let left = this.binary(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.type !== 'op' || !ops.includes(t.text as BinaryOperator)) break;
      this.next();
      const right = this.binary(level + 1);
      left = { k: 'binary', op: t.text as BinaryOperator, left, right };
    }
    return left;
  }

  private unary(): FormulaNode {
    const t = this.peek();
    if (t.type === 'op' && (t.text === '-' || t.text === '!')) {
      this.next();
      this.enter();
      const arg = this.unary();
      this.depth--;
      // fold negative number literals
      if (t.text === '-' && arg.k === 'num') return { k: 'num', v: -arg.v };
      return { k: 'unary', op: t.text as UnaryOperator, arg };
    }
    return this.primary();
  }

  private primary(): FormulaNode {
    const t = this.next();
    switch (t.type) {
      case 'number':
        return { k: 'num', v: t.value as number };
      case 'string':
        return { k: 'str', v: t.value as string };
      case 'lparen': {
        this.enter();
        const inner = this.expr();
        this.depth--;
        this.expect('rparen', '")"');
        return inner;
      }
      case 'ident':
        return this.identifier(t);
      case 'eof':
        this.fail('Formula ends unexpectedly');
        break;
      default:
        this.fail(`Unexpected ${describe(t)} at position ${t.start + 1}`);
    }
  }

  private identifier(t: Token): FormulaNode {
    const lower = t.text.toLowerCase();
    if (this.peek().type !== 'lparen') {
      if (lower === 'true') return { k: 'bool', v: true };
      if (lower === 'false') return { k: 'bool', v: false };
      this.fail(
        `Unknown name "${t.text}" at position ${t.start + 1}. ` +
          'Use prop("Name") to refer to a property',
      );
    }
    this.next(); // (

    if (lower === 'prop') {
      const name = this.peek();
      if (name.type !== 'string') {
        this.fail(
          `prop() takes a property name in quotes (position ${name.start + 1})`,
        );
      }
      this.next();
      this.expect('rparen', '")" after the property name');
      return { k: 'prop', name: name.value as string };
    }

    this.enter();
    const args: FormulaNode[] = [];
    if (this.peek().type !== 'rparen') {
      for (;;) {
        args.push(this.expr());
        if (this.peek().type === 'comma') {
          this.next();
          continue;
        }
        break;
      }
    }
    this.depth--;
    this.expect('rparen', '"," or ")"');
    return { k: 'call', fn: lower, args };
  }
}

// Parses a formula source to an unresolved AST (property references carry
// names). Throws FormulaCompileError on syntax errors.
export function parseFormula(source: string): FormulaNode {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new FormulaCompileError('Formula is empty', 'EMPTY');
  }
  if (source.length > MAX_FORMULA_LENGTH) {
    throw new FormulaCompileError(
      `Formula is too long (max ${MAX_FORMULA_LENGTH} characters)`,
      'TOO_LONG',
    );
  }
  return new Parser(tokenize(source)).parse();
}
