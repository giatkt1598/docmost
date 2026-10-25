import { RawBuilder, sql } from 'kysely';
import {
  EngineProperty,
  FilterCondition,
  FilterNode,
} from './base.types';
import {
  cellExpr,
  cellKindOf,
  escapeLike,
  isEmptyExpr,
} from './cell-sql';
import { resolveDateFilterValue } from './date-range';

export class FilterCompileError extends Error {}

type Bool = RawBuilder<boolean>;

const TRUE = sql<boolean>`true`;

function isGroup(
  node: FilterNode,
): node is Extract<FilterNode, { children: any }> {
  return Array.isArray((node as any).children);
}

export function compileFilter(
  node: FilterNode | null | undefined,
  properties: ReadonlyMap<string, EngineProperty>,
  now = new Date(),
): Bool {
  if (!node) return TRUE;
  if (isGroup(node)) {
    if (node.children.length === 0) return TRUE;
    const parts = node.children.map((c) => compileFilter(c, properties, now));
    const joiner = node.op === 'or' ? sql` or ` : sql` and `;
    return sql<boolean>`(${sql.join(parts, joiner)})`;
  }
  const prop = properties.get(node.propertyId);
  if (!prop) {
    throw new FilterCompileError(`Unknown property ${node.propertyId}`);
  }
  return compileCondition(node, prop, now);
}

function asStringArray(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : value == null ? [] : [value];
  return arr.map((v) => String(v));
}

function textArray(values: string[]) {
  return sql`array[${sql.join(values.map((v) => sql`${v}`))}]::text[]`;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (value === '' || value == null || !Number.isFinite(n)) {
    throw new FilterCompileError('Invalid number in filter');
  }
  return n;
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  if (['true', '1', 'yes'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  throw new FilterCompileError('Invalid checkbox value in filter');
}

function compileCondition(
  cond: FilterCondition,
  prop: EngineProperty,
  now: Date,
): Bool {
  const { op, value } = cond;
  if (op === 'isEmpty') return isEmptyExpr(prop);
  if (op === 'isNotEmpty') return sql<boolean>`(not ${isEmptyExpr(prop)})`;

  const expr = cellExpr(prop);
  const kind = cellKindOf(prop);

  if (kind === 'text' || kind === 'userId') {
    // choice and person-like text cells compare ids
    if (op === 'any' || op === 'none') {
      const ids = asStringArray(value);
      if (ids.length === 0) return TRUE;
      const hit = sql<boolean>`coalesce(${expr} = any(${textArray(ids)}), false)`;
      return op === 'any' ? hit : sql<boolean>`(not ${hit})`;
    }
    const text = String(value ?? '');
    const like = escapeLike(text);
    switch (op) {
      case 'eq':
        return sql<boolean>`coalesce(${expr} = ${text}, false)`;
      case 'neq':
        return sql<boolean>`(${expr} is distinct from ${text})`;
      case 'contains':
        return sql<boolean>`coalesce(${expr} ilike ${`%${like}%`}, false)`;
      case 'ncontains':
        return sql<boolean>`coalesce(${expr} not ilike ${`%${like}%`}, true)`;
      case 'startsWith':
        return sql<boolean>`coalesce(${expr} ilike ${`${like}%`}, false)`;
      case 'endsWith':
        return sql<boolean>`coalesce(${expr} ilike ${`%${like}`}, false)`;
    }
  }

  if (kind === 'numeric') {
    const n = toNumber(value);
    switch (op) {
      case 'eq':
        return sql<boolean>`coalesce(${expr} = ${n}, false)`;
      case 'neq':
        return sql<boolean>`(${expr} is distinct from ${n}::numeric)`;
      case 'gt':
        return sql<boolean>`coalesce(${expr} > ${n}, false)`;
      case 'gte':
        return sql<boolean>`coalesce(${expr} >= ${n}, false)`;
      case 'lt':
        return sql<boolean>`coalesce(${expr} < ${n}, false)`;
      case 'lte':
        return sql<boolean>`coalesce(${expr} <= ${n}, false)`;
    }
  }

  if (kind === 'bool') {
    const b = toBool(value);
    // an unchecked box and an absent cell are the same thing to the user
    if (op === 'eq') return sql<boolean>`(coalesce(${expr}, false) = ${b})`;
    if (op === 'neq') return sql<boolean>`(coalesce(${expr}, false) <> ${b})`;
  }

  if (kind === 'array') {
    const ids = asStringArray(value);
    if (ids.length === 0 && ['any', 'none', 'all', 'eq', 'neq'].includes(op)) {
      return TRUE;
    }
    const anyHit = sql<boolean>`coalesce(${expr} ?| ${textArray(ids)}, false)`;
    switch (op) {
      case 'any':
      case 'eq':
        return anyHit;
      case 'none':
      case 'neq':
        return sql<boolean>`(not ${anyHit})`;
      case 'all':
        return sql<boolean>`coalesce(${expr} ?& ${textArray(ids)}, false)`;
    }
  }

  if (kind === 'timestamptz') {
    const range = resolveDateFilterValue(value, op, now);
    const start = range.start.toISOString();
    const end = range.end.toISOString();
    const inRange = sql<boolean>`(${expr} >= ${start}::timestamptz and ${expr} < ${end}::timestamptz)`;
    switch (op) {
      case 'eq':
      case 'isWithin':
        return sql<boolean>`coalesce(${inRange}, false)`;
      case 'neq':
        return sql<boolean>`coalesce(not ${inRange}, true)`;
      case 'before':
      case 'lt':
        return sql<boolean>`coalesce(${expr} < ${start}::timestamptz, false)`;
      case 'after':
      case 'gt':
        return sql<boolean>`coalesce(${expr} >= ${end}::timestamptz, false)`;
      case 'onOrBefore':
      case 'lte':
        return sql<boolean>`coalesce(${expr} < ${end}::timestamptz, false)`;
      case 'onOrAfter':
      case 'gte':
        return sql<boolean>`coalesce(${expr} >= ${start}::timestamptz, false)`;
    }
  }

  throw new FilterCompileError(
    `Operator "${op}" is not supported for ${prop.type} properties`,
  );
}
