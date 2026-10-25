// Shared types of the formula language: static types, runtime values, AST
// nodes and the two error classes.

// Static types inferred by the type checker. `empty` is a value that is not
// known at compile time (it fits wherever another type is expected).
export type FormulaType =
  | 'number'
  | 'text'
  | 'boolean'
  | 'date'
  | 'list'
  | 'empty';

// Types a formula property may produce (stored as typeOptions.resultType).
export type FormulaResultType = 'number' | 'text' | 'boolean' | 'date';

export const FORMULA_RESULT_TYPES: readonly FormulaResultType[] = [
  'number',
  'text',
  'boolean',
  'date',
];

// Runtime values. `null` is the empty value; dates are Date objects.
export type FormulaValue =
  | number
  | string
  | boolean
  | Date
  | FormulaList
  | null;
export type FormulaList = { kind: 'list'; items: string[] };

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '<'
  | '<='
  | '>'
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||';

export type UnaryOperator = '-' | '!';

// AST. Property references carry the property name right after parsing and
// the property id once resolved; only resolved trees are stored.
export type FormulaNode =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'prop'; id?: string; name?: string }
  | { k: 'unary'; op: UnaryOperator; arg: FormulaNode }
  | { k: 'binary'; op: BinaryOperator; left: FormulaNode; right: FormulaNode }
  | { k: 'call'; fn: string; args: FormulaNode[] };

// Version of the stored AST format. Anything else is an older formula that
// has to be edited before it computes again.
export const FORMULA_AST_VERSION = 2;

export type FormulaErrorCode =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'SYNTAX'
  | 'UNKNOWN_PROPERTY'
  | 'SELF_REFERENCE'
  | 'UNKNOWN_FUNCTION'
  | 'ARGUMENTS'
  | 'TYPE'
  | 'RESULT_TYPE'
  | 'CYCLE';

export class FormulaCompileError extends Error {
  constructor(
    message: string,
    readonly code: FormulaErrorCode | string,
  ) {
    super(message);
    this.name = 'FormulaCompileError';
  }
}

// Thrown while evaluating a row; the evaluator turns it into { __err }.
export class FormulaRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaRuntimeError';
  }
}

export function isList(v: unknown): v is FormulaList {
  return (
    typeof v === 'object' &&
    v !== null &&
    !(v instanceof Date) &&
    (v as FormulaList).kind === 'list'
  );
}

export function typeOfValue(v: FormulaValue): FormulaType {
  if (v === null || v === undefined) return 'empty';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'boolean') return 'boolean';
  if (v instanceof Date) return 'date';
  return 'list';
}
