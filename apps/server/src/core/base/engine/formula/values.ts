import { formatDate } from './date-utils';
import {
  FormulaRuntimeError,
  FormulaType,
  FormulaValue,
  isList,
  typeOfValue,
} from './types';

// Runtime helpers shared by operators and functions.

export const MAX_TEXT_RESULT = 25000;

export function describeType(t: FormulaType): string {
  return t === 'empty' ? 'an empty value' : t === 'list' ? 'a list' : `a ${t}`;
}

export function isEmptyValue(v: FormulaValue): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (isList(v)) return v.items.length === 0;
  return false;
}

// Drops floating point noise (0.1 + 0.2 -> 0.3).
export function cleanNumber(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return n;
  return Number(n.toPrecision(15));
}

export function numberToText(n: number): string {
  return String(cleanNumber(n));
}

export function dateToText(d: Date): string {
  const midnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return formatDate(d, midnight ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm');
}

export function toText(v: FormulaValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numberToText(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return dateToText(v);
  return v.items.join(', ');
}

function wrongType(expected: string, v: FormulaValue, where: string): never {
  throw new FormulaRuntimeError(
    `${where} expects ${expected}, got ${describeType(typeOfValue(v))}`,
  );
}

export function expectNumber(v: FormulaValue, where: string): number {
  if (typeof v !== 'number') wrongType('a number', v, where);
  return v;
}

export function expectText(v: FormulaValue, where: string): string {
  if (typeof v !== 'string') wrongType('a text', v, where);
  return v;
}

export function expectDate(v: FormulaValue, where: string): Date {
  if (!(v instanceof Date)) wrongType('a date', v, where);
  return v;
}

// Conditions: empty counts as false, anything but a boolean is an error.
export function truthy(v: FormulaValue, where: string): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v !== 'boolean') wrongType('a boolean', v, where);
  return v;
}

export function checkText(s: string): string {
  if (s.length > MAX_TEXT_RESULT) {
    throw new FormulaRuntimeError('Text is too long');
  }
  return s;
}

export function checkNumber(n: number): number {
  if (!Number.isFinite(n)) {
    throw new FormulaRuntimeError('The result is not a finite number');
  }
  return n;
}

export function valuesEqual(a: FormulaValue, b: FormulaValue): boolean {
  const ea = a === null || a === undefined;
  const eb = b === null || b === undefined;
  if (ea || eb) return ea && eb;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (isList(a) && isList(b)) {
    return (
      a.items.length === b.items.length &&
      a.items.every((x, i) => x === b.items[i])
    );
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return cleanNumber(a) === cleanNumber(b);
  }
  return a === b;
}
