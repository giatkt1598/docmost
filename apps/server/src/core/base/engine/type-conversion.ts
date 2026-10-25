import {
  CHOICE_TYPES,
  MAX_LONG_TEXT_LENGTH,
  MAX_TEXT_LENGTH,
  READONLY_CELL_TYPES,
} from './base.types';

export type ConversionSide = { type: string; typeOptions: any };

// Names that the lossy conversions to text need. Filled by the caller before
// a batch is converted.
export type ConversionLookups = {
  userNames: ReadonlyMap<string, string>;
  pageTitles: ReadonlyMap<string, string>;
};

export const EMPTY_LOOKUPS: ConversionLookups = {
  userNames: new Map(),
  pageTitles: new Map(),
};

export function isConvertibleTarget(type: string): boolean {
  return !READONLY_CELL_TYPES.has(type);
}

// Which user / page ids a batch of cells references, so the caller can load
// their names in one query.
export function referencedIds(
  fromType: string,
  cells: unknown[],
): { userIds: string[]; pageIds: string[] } {
  const userIds = new Set<string>();
  const pageIds = new Set<string>();
  for (const v of cells) {
    if (fromType === 'person') {
      for (const id of asArray(v)) if (typeof id === 'string') userIds.add(id);
    } else if (fromType === 'page' && typeof v === 'string') {
      pageIds.add(v);
    }
  }
  return { userIds: [...userIds], pageIds: [...pageIds] };
}

function asArray(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function choiceName(opts: any, id: unknown): string | null {
  const c = (opts?.choices ?? []).find((x: any) => x.id === id);
  return c ? c.name : null;
}

// Resolves a raw value (choice id or display name) to a choice id of the
// target options.
function mapToChoice(value: unknown, from: ConversionSide, to: ConversionSide) {
  if (typeof value !== 'string' || value === '') return null;
  const targetChoices: any[] = to.typeOptions?.choices ?? [];
  if (CHOICE_TYPES.has(from.type)) {
    if (targetChoices.some((c) => c.id === value)) return value;
    const name = choiceName(from.typeOptions, value);
    if (name == null) return null;
    return findByName(targetChoices, name);
  }
  return findByName(targetChoices, value);
}

function findByName(choices: any[], name: string): string | null {
  const needle = name.trim().toLowerCase();
  const hit = choices.find(
    (c) => String(c.name).trim().toLowerCase() === needle,
  );
  return hit ? hit.id : null;
}

function toDisplayText(
  value: unknown,
  from: ConversionSide,
  lookups: ConversionLookups,
): string | null {
  if (value == null) return null;
  switch (from.type) {
    case 'select':
    case 'status':
      return choiceName(from.typeOptions, value);
    case 'multiSelect': {
      const names = asArray(value)
        .map((id) => choiceName(from.typeOptions, id))
        .filter((n): n is string => !!n);
      return names.length ? names.join(', ') : null;
    }
    case 'person': {
      const names = asArray(value)
        .map((id) => lookups.userNames.get(String(id)))
        .filter((n): n is string => !!n);
      return names.length ? names.join(', ') : null;
    }
    case 'file': {
      const names = asArray(value)
        .map((f: any) => f?.fileName)
        .filter((n): n is string => typeof n === 'string' && n !== '');
      return names.length ? names.join(', ') : null;
    }
    case 'page':
      return lookups.pageTitles.get(String(value)) ?? null;
    case 'checkbox':
      return value === true ? 'true' : 'false';
    default:
      if (typeof value === 'object') return null;
      return String(value);
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['true', 't', 'yes', 'y', 'on', '1'].includes(
      value.trim().toLowerCase(),
    );
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

// Converts one stored cell value to the new type. Returns null when the
// value cannot be represented (the cell is then cleared).
export function convertCell(
  value: unknown,
  from: ConversionSide,
  to: ConversionSide,
  lookups: ConversionLookups = EMPTY_LOOKUPS,
): unknown {
  if (value === undefined || value === null) return null;
  // formula results are plain scalars; error cells never convert
  if (typeof value === 'object' && !Array.isArray(value) && '__err' in (value as object)) {
    return null;
  }

  switch (to.type) {
    case 'text':
    case 'longText': {
      const text = toDisplayText(value, from, lookups);
      if (text == null || text === '') return null;
      const max = to.type === 'text' ? MAX_TEXT_LENGTH : MAX_LONG_TEXT_LENGTH;
      return text.length > max ? text.slice(0, max) : text;
    }
    case 'number':
      return parseNumber(value);
    case 'date':
      return parseDate(value);
    case 'checkbox':
      return parseBool(value) ?? false;
    case 'select':
    case 'status': {
      const first = Array.isArray(value) ? value[0] : value;
      return mapToChoice(first, from, to);
    }
    case 'multiSelect': {
      const source =
        typeof value === 'string' && !CHOICE_TYPES.has(from.type)
          ? value.split(',').map((s) => s.trim())
          : asArray(value);
      const ids: string[] = [];
      for (const v of source) {
        const id = mapToChoice(v, from, to);
        if (id && !ids.includes(id)) ids.push(id);
      }
      return ids.length ? ids : null;
    }
    case 'person': {
      if (from.type !== 'person') return null;
      const ids = asArray(value).filter((v) => typeof v === 'string');
      if (ids.length === 0) return null;
      return to.typeOptions?.allowMultiple ? ids : ids[0];
    }
    case 'page':
      return from.type === 'page' && typeof value === 'string' ? value : null;
    case 'file':
      return from.type === 'file' && Array.isArray(value) && value.length
        ? value
        : null;
    case 'url':
      return parseUrl(toDisplayText(value, from, lookups));
    case 'email': {
      const s = toDisplayText(value, from, lookups)?.trim();
      return s && EMAIL_RE.test(s) ? s : null;
    }
    default:
      return null;
  }
}
