import {
  dateAdd,
  dateBetween,
  DATE_UNITS,
  formatDate,
  isValidDate,
  parseDateUnit,
  startOfUtcDay,
} from './date-utils';
import {
  FormulaCompileError,
  FormulaNode,
  FormulaRuntimeError,
  FormulaType,
  FormulaValue,
  isList,
} from './types';
import {
  checkNumber,
  checkText,
  describeType,
  expectDate,
  expectNumber,
  expectText,
  isEmptyValue,
  toText,
  truthy,
} from './values';

export type Thunk = () => FormulaValue;

export type EvalEnv = {
  // fixed per evaluation batch so now() is stable across rows
  now: Date;
};

type ArgSpec = FormulaType[] | 'any' | 'scalar';

export type FunctionDef = {
  name: string;
  signature: string;
  description: string;
  minArgs: number;
  maxArgs: number;
  // types accepted by each argument; the last spec repeats for variadics
  args: ArgSpec[];
  // result type from the argument types (after argument checks)
  returns: (types: FormulaType[], nodes: FormulaNode[]) => FormulaType;
  // arguments are thunks so that if/ifs/and/or evaluate lazily
  evaluate: (args: Thunk[], env: EvalEnv) => FormulaValue;
};

const SCALARS: FormulaType[] = ['number', 'text', 'boolean', 'date'];

export function unifyTypes(
  a: FormulaType,
  b: FormulaType,
  where: string,
): FormulaType {
  if (a === 'empty') return b;
  if (b === 'empty' || a === b) return a;
  throw new FormulaCompileError(
    `${where} must all have the same type, got ${describeType(a)} and ${describeType(b)}`,
    'TYPE',
  );
}

const fixed = (t: FormulaType) => () => t;

function unitFromNode(node: FormulaNode, fn: string) {
  if (node.k === 'str' && !parseDateUnit(node.v)) {
    throw new FormulaCompileError(
      `${fn}() unit must be one of ${DATE_UNITS.map((u) => `"${u}"`).join(', ')}`,
      'TYPE',
    );
  }
}

function runtimeUnit(v: FormulaValue, fn: string) {
  const unit = parseDateUnit(expectText(v, `${fn}()`));
  if (!unit) throw new FormulaRuntimeError(`${fn}(): unknown unit "${v}"`);
  return unit;
}

function checkedDate(d: Date): Date {
  if (!isValidDate(d)) throw new FormulaRuntimeError('Invalid date');
  return d;
}

function numbers(args: Thunk[], fn: string): number[] {
  const out: number[] = [];
  for (const a of args) {
    const v = a();
    if (v === null) continue;
    out.push(expectNumber(v, `${fn}()`));
  }
  return out;
}

// Each function returns empty when a required input is empty, except the
// ones that are about emptiness (empty, length, toText, concat, ...).
function emptyIn(...values: FormulaValue[]) {
  return values.some((v) => v === null || v === undefined);
}

function textFn(
  name: string,
  description: string,
  fn: (s: string) => string,
): FunctionDef {
  return {
    name,
    signature: `${name}(text)`,
    description,
    minArgs: 1,
    maxArgs: 1,
    args: [['text']],
    returns: fixed('text'),
    evaluate: ([a]) => {
      const v = a();
      if (v === null) return null;
      return fn(expectText(v, `${name}()`));
    },
  };
}

function numberFn(
  name: string,
  description: string,
  fn: (n: number) => number,
): FunctionDef {
  return {
    name,
    signature: `${name}(number)`,
    description,
    minArgs: 1,
    maxArgs: 1,
    args: [['number']],
    returns: fixed('number'),
    evaluate: ([a]) => {
      const v = a();
      if (v === null) return null;
      return checkNumber(fn(expectNumber(v, `${name}()`)));
    },
  };
}

function datePartFn(
  name: string,
  description: string,
  fn: (d: Date) => number,
): FunctionDef {
  return {
    name,
    signature: `${name}(date)`,
    description,
    minArgs: 1,
    maxArgs: 1,
    args: [['date']],
    returns: fixed('number'),
    evaluate: ([a]) => {
      const v = a();
      if (v === null) return null;
      return fn(expectDate(v, `${name}()`));
    },
  };
}

function roundTo(x: number, digits: number): number {
  const sign = x < 0 ? -1 : 1;
  const shifted = Math.round(Number(`${Math.abs(x)}e${digits}`));
  return sign * Number(`${shifted}e${-digits}`);
}

const DEFS: FunctionDef[] = [
  // ---- logic ------------------------------------------------------------
  {
    name: 'if',
    signature: 'if(condition, then, else)',
    description: 'Returns "then" when the condition is true, otherwise "else"',
    minArgs: 3,
    maxArgs: 3,
    args: [['boolean'], 'any', 'any'],
    returns: (t) => unifyTypes(t[1], t[2], 'The branches of if()'),
    evaluate: ([c, a, b]) => (truthy(c(), 'if()') ? a() : b()),
  },
  {
    name: 'ifs',
    signature: 'ifs(condition1, value1, condition2, value2, ..., else)',
    description: 'Returns the value of the first true condition, or "else"',
    minArgs: 3,
    maxArgs: Infinity,
    args: ['any'],
    returns: (t) => {
      if (t.length % 2 === 0) {
        throw new FormulaCompileError(
          'ifs() takes condition/value pairs followed by a default value',
          'ARGUMENTS',
        );
      }
      let out: FormulaType = 'empty';
      for (let i = 0; i < t.length; i++) {
        const isCondition = i % 2 === 0 && i < t.length - 1;
        if (isCondition) {
          if (t[i] !== 'boolean' && t[i] !== 'empty') {
            throw new FormulaCompileError(
              `ifs() argument ${i + 1} must be a boolean, got ${describeType(t[i])}`,
              'TYPE',
            );
          }
        } else {
          out = unifyTypes(out, t[i], 'The values of ifs()');
        }
      }
      return out;
    },
    evaluate: (args) => {
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (truthy(args[i](), 'ifs()')) return args[i + 1]();
      }
      return args[args.length - 1]();
    },
  },
  {
    name: 'and',
    signature: 'and(a, b, ...)',
    description: 'True when every argument is true',
    minArgs: 1,
    maxArgs: Infinity,
    args: [['boolean']],
    returns: fixed('boolean'),
    evaluate: (args) => args.every((a) => truthy(a(), 'and()')),
  },
  {
    name: 'or',
    signature: 'or(a, b, ...)',
    description: 'True when at least one argument is true',
    minArgs: 1,
    maxArgs: Infinity,
    args: [['boolean']],
    returns: fixed('boolean'),
    evaluate: (args) => args.some((a) => truthy(a(), 'or()')),
  },
  {
    name: 'not',
    signature: 'not(value)',
    description: 'Inverts a boolean',
    minArgs: 1,
    maxArgs: 1,
    args: [['boolean']],
    returns: fixed('boolean'),
    evaluate: ([a]) => !truthy(a(), 'not()'),
  },
  {
    name: 'empty',
    signature: 'empty(value)',
    description:
      'True when the value is empty (no value, blank text, empty list)',
    minArgs: 1,
    maxArgs: 1,
    args: ['any'],
    returns: fixed('boolean'),
    evaluate: ([a]) => isEmptyValue(a()),
  },

  // ---- text -------------------------------------------------------------
  {
    name: 'concat',
    signature: 'concat(a, b, ...)',
    description: 'Joins values into one text',
    minArgs: 1,
    maxArgs: Infinity,
    args: ['any'],
    returns: fixed('text'),
    evaluate: (args) => checkText(args.map((a) => toText(a())).join('')),
  },
  {
    name: 'length',
    signature: 'length(value)',
    description: 'Number of characters of a text, or of items in a list',
    minArgs: 1,
    maxArgs: 1,
    args: [['text', 'list']],
    returns: fixed('number'),
    evaluate: ([a]) => {
      const v = a();
      if (v === null) return 0;
      if (isList(v)) return v.items.length;
      return Array.from(expectText(v, 'length()')).length;
    },
  },
  textFn('lower', 'Converts a text to lower case', (s) => s.toLowerCase()),
  textFn('upper', 'Converts a text to upper case', (s) => s.toUpperCase()),
  textFn('trim', 'Removes spaces at both ends of a text', (s) => s.trim()),
  {
    name: 'contains',
    signature: 'contains(text, part)',
    description: 'True when the text contains the part (or the list the item)',
    minArgs: 2,
    maxArgs: 2,
    args: [['text', 'list'], ['text']],
    returns: fixed('boolean'),
    evaluate: ([a, b]) => {
      const haystack = a();
      const needle = toText(b());
      if (haystack === null) return false;
      if (isList(haystack)) return haystack.items.includes(needle);
      return expectText(haystack, 'contains()').includes(needle);
    },
  },
  {
    name: 'replace',
    signature: 'replace(text, find, with)',
    description: 'Replaces every occurrence of "find" with "with"',
    minArgs: 3,
    maxArgs: 3,
    args: [['text'], ['text'], ['text']],
    returns: fixed('text'),
    evaluate: ([a, b, c]) => {
      const text = a();
      if (text === null) return null;
      const s = expectText(text, 'replace()');
      const find = toText(b());
      if (find === '') return s;
      return checkText(s.split(find).join(toText(c())));
    },
  },
  {
    name: 'totext',
    signature: 'toText(value)',
    description: 'Converts any value to text',
    minArgs: 1,
    maxArgs: 1,
    args: ['any'],
    returns: fixed('text'),
    evaluate: ([a]) => toText(a()),
  },

  // ---- number -----------------------------------------------------------
  {
    name: 'round',
    signature: 'round(number, digits?)',
    description: 'Rounds a number, optionally to a number of decimal digits',
    minArgs: 1,
    maxArgs: 2,
    args: [['number'], ['number']],
    returns: fixed('number'),
    evaluate: ([a, b]) => {
      const v = a();
      const d = b ? b() : 0;
      if (emptyIn(v)) return null;
      const x = expectNumber(v, 'round()');
      const digits = d === null ? 0 : expectNumber(d, 'round()');
      if (!Number.isInteger(digits) || digits < -15 || digits > 15) {
        throw new FormulaRuntimeError(
          'round() digits must be a whole number between -15 and 15',
        );
      }
      return checkNumber(roundTo(x, digits));
    },
  },
  numberFn('floor', 'Rounds a number down', Math.floor),
  numberFn('ceil', 'Rounds a number up', Math.ceil),
  numberFn('abs', 'Absolute value of a number', Math.abs),
  {
    name: 'min',
    signature: 'min(a, b, ...)',
    description: 'Smallest of the numbers (empty values are skipped)',
    minArgs: 1,
    maxArgs: Infinity,
    args: [['number']],
    returns: fixed('number'),
    evaluate: (args) => {
      const ns = numbers(args, 'min');
      return ns.length ? Math.min(...ns) : null;
    },
  },
  {
    name: 'max',
    signature: 'max(a, b, ...)',
    description: 'Largest of the numbers (empty values are skipped)',
    minArgs: 1,
    maxArgs: Infinity,
    args: [['number']],
    returns: fixed('number'),
    evaluate: (args) => {
      const ns = numbers(args, 'max');
      return ns.length ? Math.max(...ns) : null;
    },
  },
  {
    name: 'sum',
    signature: 'sum(a, b, ...)',
    description: 'Adds the numbers (empty values count as 0)',
    minArgs: 1,
    maxArgs: Infinity,
    args: [['number']],
    returns: fixed('number'),
    evaluate: (args) =>
      checkNumber(numbers(args, 'sum').reduce((s, n) => s + n, 0)),
  },
  {
    name: 'tonumber',
    signature: 'toNumber(value)',
    description: 'Converts a text, boolean or date (milliseconds) to a number',
    minArgs: 1,
    maxArgs: 1,
    args: ['scalar'],
    returns: fixed('number'),
    evaluate: ([a]) => {
      const v = a();
      if (v === null) return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string') {
        const s = v.trim();
        if (s === '') return null;
        const n = Number(s);
        if (!Number.isFinite(n)) {
          throw new FormulaRuntimeError(
            `toNumber(): cannot convert "${s.length > 40 ? s.slice(0, 40) + '…' : s}" to a number`,
          );
        }
        return n;
      }
      throw new FormulaRuntimeError('toNumber() cannot convert a list');
    },
  },

  // ---- date -------------------------------------------------------------
  {
    name: 'now',
    signature: 'now()',
    description: 'The current date and time',
    minArgs: 0,
    maxArgs: 0,
    args: [],
    returns: fixed('date'),
    evaluate: (_args, env) => new Date(env.now.getTime()),
  },
  {
    name: 'today',
    signature: 'today()',
    description: 'The current date at midnight (UTC)',
    minArgs: 0,
    maxArgs: 0,
    args: [],
    returns: fixed('date'),
    evaluate: (_args, env) => startOfUtcDay(env.now),
  },
  {
    name: 'dateadd',
    signature: 'dateAdd(date, amount, unit)',
    description:
      'Adds an amount of "years", "months", "weeks", "days", "hours" or "minutes"',
    minArgs: 3,
    maxArgs: 3,
    args: [['date'], ['number'], ['text']],
    returns: (_t, nodes) => {
      unitFromNode(nodes[2], 'dateAdd');
      return 'date';
    },
    evaluate: ([a, b, c]) => {
      const d = a();
      const n = b();
      if (emptyIn(d, n)) return null;
      const unit = runtimeUnit(c(), 'dateAdd');
      return checkedDate(
        dateAdd(expectDate(d, 'dateAdd()'), expectNumber(n, 'dateAdd()'), unit),
      );
    },
  },
  {
    name: 'datebetween',
    signature: 'dateBetween(date1, date2, unit)',
    description: 'date1 - date2 in whole units',
    minArgs: 3,
    maxArgs: 3,
    args: [['date'], ['date'], ['text']],
    returns: (_t, nodes) => {
      unitFromNode(nodes[2], 'dateBetween');
      return 'number';
    },
    evaluate: ([a, b, c]) => {
      const x = a();
      const y = b();
      if (emptyIn(x, y)) return null;
      const unit = runtimeUnit(c(), 'dateBetween');
      return dateBetween(
        expectDate(x, 'dateBetween()'),
        expectDate(y, 'dateBetween()'),
        unit,
      );
    },
  },
  {
    name: 'formatdate',
    signature: 'formatDate(date, format)',
    description: 'Formats a date, e.g. formatDate(now(), "DD/MM/YYYY")',
    minArgs: 2,
    maxArgs: 2,
    args: [['date'], ['text']],
    returns: fixed('text'),
    evaluate: ([a, b]) => {
      const d = a();
      if (d === null) return null;
      const format = expectText(b() ?? '', 'formatDate()');
      return checkText(formatDate(expectDate(d, 'formatDate()'), format));
    },
  },
  datePartFn('year', 'Year of a date', (d) => d.getUTCFullYear()),
  datePartFn('month', 'Month of a date (1-12)', (d) => d.getUTCMonth() + 1),
  datePartFn('day', 'Day of the month of a date', (d) => d.getUTCDate()),
];

export const FUNCTIONS: ReadonlyMap<string, FunctionDef> = new Map(
  DEFS.map((d) => [d.name, d]),
);

export function argSpecAt(def: FunctionDef, index: number): ArgSpec {
  return def.args[Math.min(index, def.args.length - 1)] ?? 'any';
}

export function acceptsType(spec: ArgSpec, t: FormulaType): boolean {
  if (t === 'empty' || spec === 'any') return true;
  if (spec === 'scalar') return SCALARS.includes(t);
  return spec.includes(t);
}

export function describeArgSpec(spec: ArgSpec): string {
  if (spec === 'any') return 'any value';
  if (spec === 'scalar') return 'a number, text, boolean or date';
  return spec.map(describeType).join(' or ');
}
