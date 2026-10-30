import { isIP } from 'node:net';
import { isUUID } from 'class-validator';

const SENSITIVE_KEY =
  /(password|passwd|secret|token|api_?key|private_?key|authorization|cookie|backup_?codes?)$/i;

export const REDACTED = '[redacted]';

// Safety net for what leaves the app through SIEM: callers pick the fields they
// log, this catches a credential that slips into a before/after diff.
export function redactSensitive<T>(value: T, seen = new WeakSet()): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen)) as T;
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }
  if (seen.has(value as object)) return undefined;
  seen.add(value as object);

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : redactSensitive(entry, seen);
  }
  return result as T;
}

// These columns are typed: one malformed value must not fail the whole insert.
export function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && isUUID(value) ? value : null;
}

export function ipOrNull(value: unknown): string | null {
  return typeof value === 'string' && isIP(value) !== 0 ? value : null;
}
