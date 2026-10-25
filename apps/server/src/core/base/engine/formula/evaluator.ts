import { EvalEnv, FUNCTIONS } from './functions';
import {
  FormulaList,
  FormulaNode,
  FormulaResultType,
  FormulaRuntimeError,
  FormulaValue,
  isList,
  typeOfValue,
} from './types';
import {
  checkNumber,
  checkText,
  cleanNumber,
  describeType,
  expectNumber,
  toText,
  truthy,
  valuesEqual,
} from './values';
import { isValidDate } from './date-utils';

export type EvalContext = {
  env: EvalEnv;
  // value of a property reference; throws FormulaRuntimeError when it
  // cannot be read
  read: (propertyId: string) => FormulaValue;
};

function list(items: unknown[]): FormulaList {
  return {
    kind: 'list',
    items: items
      .filter((x) => typeof x === 'string' && x !== '')
      .map((x) => x as string),
  };
}

function choiceName(typeOptions: any, id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const choices: any[] = Array.isArray(typeOptions?.choices)
    ? typeOptions.choices
    : [];
  const choice = choices.find((c) => c?.id === id);
  return typeof choice?.name === 'string' ? choice.name : null;
}

function parseDate(raw: unknown): Date | null {
  if (raw instanceof Date) return isValidDate(raw) ? raw : null;
  if (typeof raw !== 'string' || raw === '') return null;
  const d = new Date(raw);
  return isValidDate(d) ? d : null;
}

// Converts a stored cell (or system value) to a formula value. Values that
// do not fit the property type read as empty.
export function cellToValue(
  type: string,
  typeOptions: any,
  raw: unknown,
): FormulaValue {
  switch (type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
      if (typeof raw === 'string') return raw === '' ? null : raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') {
        return String(raw);
      }
      return null;
    case 'number':
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      return null;
    case 'checkbox':
      // an unchecked box is usually stored as an absent cell
      return raw === true;
    case 'date':
    case 'createdAt':
    case 'lastEditedAt':
      return parseDate(raw);
    case 'select':
    case 'status':
      return choiceName(typeOptions, raw);
    case 'multiSelect':
      return list(
        (Array.isArray(raw) ? raw : []).map((id) =>
          choiceName(typeOptions, id),
        ),
      );
    case 'person':
    case 'page':
    case 'lastEditedBy':
      return list(Array.isArray(raw) ? raw : [raw]);
    case 'file':
      return list(
        (Array.isArray(raw) ? raw : []).map((f) =>
          typeof f?.fileName === 'string' && f.fileName ? f.fileName : f?.id,
        ),
      );
    default:
      return null;
  }
}

function compare(op: string, a: FormulaValue, b: FormulaValue): boolean {
  if (a === null || b === null) return false;
  let x: number | string;
  let y: number | string;
  if (typeof a === 'number' && typeof b === 'number') {
    x = cleanNumber(a);
    y = cleanNumber(b);
  } else if (typeof a === 'string' && typeof b === 'string') {
    x = a;
    y = b;
  } else if (a instanceof Date && b instanceof Date) {
    x = a.getTime();
    y = b.getTime();
  } else {
    throw new FormulaRuntimeError(
      `Operator "${op}" cannot compare ${describeType(typeOfValue(a))} and ${describeType(typeOfValue(b))}`,
    );
  }
  switch (op) {
    case '<':
      return x < y;
    case '<=':
      return x <= y;
    case '>':
      return x > y;
    default:
      return x >= y;
  }
}

function arithmetic(
  op: string,
  a: FormulaValue,
  b: FormulaValue,
): FormulaValue {
  if (op === '+') {
    if (typeof a === 'string' || typeof b === 'string') {
      if (isList(a) || isList(b)) {
        throw new FormulaRuntimeError(
          'Operator "+" cannot be used with a list',
        );
      }
      return checkText(toText(a) + toText(b));
    }
  }
  if (a === null || b === null) {
    if (isList(a) || isList(b)) {
      throw new FormulaRuntimeError(
        `Operator "${op}" cannot be used with a list`,
      );
    }
    return null;
  }
  const where = `Operator "${op}"`;
  const x = expectNumber(a, where);
  const y = expectNumber(b, where);
  switch (op) {
    case '+':
      return checkNumber(x + y);
    case '-':
      return checkNumber(x - y);
    case '*':
      return checkNumber(x * y);
    case '/':
      if (y === 0) throw new FormulaRuntimeError('Division by zero');
      return checkNumber(x / y);
    default:
      if (y === 0) throw new FormulaRuntimeError('Division by zero');
      return checkNumber(x % y);
  }
}

export function evaluateNode(
  node: FormulaNode,
  ctx: EvalContext,
): FormulaValue {
  switch (node?.k) {
    case 'num':
      return node.v;
    case 'str':
      return node.v;
    case 'bool':
      return node.v;
    case 'prop':
      return ctx.read(node.id);
    case 'unary': {
      const v = evaluateNode(node.arg, ctx);
      if (node.op === '!') return !truthy(v, 'Operator "!"');
      if (v === null) return null;
      return -expectNumber(v, 'Operator "-"');
    }
    case 'binary': {
      const { op } = node;
      if (op === '&&') {
        return (
          truthy(evaluateNode(node.left, ctx), 'Operator "&&"') &&
          truthy(evaluateNode(node.right, ctx), 'Operator "&&"')
        );
      }
      if (op === '||') {
        return (
          truthy(evaluateNode(node.left, ctx), 'Operator "||"') ||
          truthy(evaluateNode(node.right, ctx), 'Operator "||"')
        );
      }
      const a = evaluateNode(node.left, ctx);
      const b = evaluateNode(node.right, ctx);
      switch (op) {
        case '==':
          return valuesEqual(a, b);
        case '!=':
          return !valuesEqual(a, b);
        case '<':
        case '<=':
        case '>':
        case '>=':
          return compare(op, a, b);
        default:
          return arithmetic(op, a, b);
      }
    }
    case 'call': {
      const def = FUNCTIONS.get(node.fn);
      if (!def) throw new FormulaRuntimeError(`Unknown function "${node.fn}"`);
      const thunks = node.args.map((a) => () => evaluateNode(a, ctx));
      return def.evaluate(thunks, ctx.env);
    }
    default:
      throw new FormulaRuntimeError('Invalid formula');
  }
}

export type ErrorCell = { __err: string };

// Converts a formula value to what is stored in the row cell. `expected` is
// the stored resultType; a different runtime type means the formula needs to
// be edited (one of its inputs changed type).
export function toCellValue(
  value: FormulaValue,
  expected?: FormulaResultType,
): unknown {
  if (value === null || value === undefined) return null;
  const actual = typeOfValue(value);
  if (actual === 'list') {
    throw new FormulaRuntimeError(
      'A formula cannot return a list. Use toText() or length()',
    );
  }
  if (expected && actual !== expected) {
    throw new FormulaRuntimeError(
      `The formula now returns ${describeType(actual)} instead of ${describeType(expected)}. Edit it to update it`,
    );
  }
  if (typeof value === 'number') return cleanNumber(checkNumber(value));
  if (typeof value === 'string') return value === '' ? null : checkText(value);
  if (value instanceof Date) {
    if (!isValidDate(value)) throw new FormulaRuntimeError('Invalid date');
    return value.toISOString();
  }
  return value;
}
