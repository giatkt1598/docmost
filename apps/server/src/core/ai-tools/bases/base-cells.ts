import { BadRequestException } from '@nestjs/common';
import {
  CHOICE_TYPES,
  READONLY_CELL_TYPES,
} from '../../base/engine/base.types';

// Models name properties and choices the way people see them ("Status":
// "Done"); the base engine stores ids. These pure helpers translate both
// ways: cells and filters in, readable cells out.

export type ToolProperty = {
  id: string;
  name: string;
  type: string;
  typeOptions: any;
};

export type ToolRow = {
  id: string;
  cells: unknown;
  creatorId?: string | null;
  lastUpdatedById?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type CellRefs = {
  // email or user id -> user id of a workspace member
  users: Map<string, string>;
  // page reference as given -> page id
  pages: Map<string, string>;
};

export type ReadRefs = {
  users: Record<string, { id: string; name: string | null }>;
  pages: Record<string, { id: string; title?: string | null }>;
};

const invalid = (message: string) => new BadRequestException(message);
const norm = (s: string) => s.trim().toLowerCase();

export function findProperty(
  properties: ToolProperty[],
  key: string,
): ToolProperty {
  const byId = properties.find((p) => p.id === key);
  if (byId) return byId;
  const byName = properties.filter((p) => norm(p.name) === norm(key));
  if (byName.length === 1) return byName[0];
  throw invalid(
    `Unknown property "${key}". Properties: ${properties
      .map((p) => `"${p.name}"`)
      .join(', ')}`,
  );
}

function choicesOf(prop: ToolProperty): { id: string; name: string }[] {
  return prop.typeOptions?.choices ?? [];
}

function choiceId(prop: ToolProperty, value: unknown): string {
  const text = String(value ?? '');
  const choices = choicesOf(prop);
  const hit =
    choices.find((c) => c.id === text) ??
    choices.find((c) => norm(c.name) === norm(text));
  if (!hit) {
    throw invalid(
      `"${text}" is not a choice of "${prop.name}". Choices: ${
        choices.map((c) => `"${c.name}"`).join(', ') || '(none)'
      }`,
    );
  }
  return hit.id;
}

const list = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [value];

function userId(prop: ToolProperty, value: unknown, refs: CellRefs): string {
  const key = norm(String(value ?? ''));
  const id = refs.users.get(key);
  if (!id) {
    throw invalid(
      `"${value}" in "${prop.name}" is not a member of this workspace (use a user id or email)`,
    );
  }
  return id;
}

// One cell value, as the engine stores it. null clears the cell.
export function toCellValue(
  prop: ToolProperty,
  value: unknown,
  refs: CellRefs,
): unknown {
  if (READONLY_CELL_TYPES.has(prop.type)) {
    throw invalid(`"${prop.name}" (${prop.type}) is computed and read-only`);
  }
  if (value === null || value === undefined || value === '') return null;
  switch (prop.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
      return typeof value === 'string' ? value : String(value);
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) {
        throw invalid(`"${prop.name}" needs a number, got "${value}"`);
      }
      return n;
    }
    case 'checkbox':
      if (typeof value === 'boolean') return value;
      if (/^(true|yes|1|x|✓)$/i.test(String(value))) return true;
      if (/^(false|no|0)$/i.test(String(value))) return false;
      throw invalid(`"${prop.name}" needs true or false, got "${value}"`);
    case 'date': {
      const text = String(value);
      if (Number.isNaN(Date.parse(text))) {
        throw invalid(
          `"${prop.name}" needs an ISO date like 2026-10-27, got "${value}"`,
        );
      }
      return text;
    }
    case 'select':
    case 'status':
      return choiceId(prop, Array.isArray(value) ? value[0] : value);
    case 'multiSelect':
      return [...new Set(list(value).map((v) => choiceId(prop, v)))];
    case 'person': {
      const ids = [...new Set(list(value).map((v) => userId(prop, v, refs)))];
      if (prop.typeOptions?.allowMultiple) return ids;
      if (ids.length > 1) {
        throw invalid(`"${prop.name}" takes one person`);
      }
      return ids[0] ?? null;
    }
    case 'page': {
      const id = refs.pages.get(String(value).trim());
      if (!id) throw invalid(`Page "${value}" in "${prop.name}" not found`);
      return id;
    }
    case 'file':
      throw invalid(
        `"${prop.name}" is a file property; the AI tools cannot set files yet`,
      );
    default:
      throw invalid(`"${prop.name}" (${prop.type}) cannot be written`);
  }
}

// Cells keyed by property name (or id) -> cells keyed by property id.
export function toCells(
  properties: ToolProperty[],
  cells: Record<string, unknown>,
  refs: CellRefs,
): Record<string, unknown> {
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) {
    throw invalid('cells must be an object of property name -> value');
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cells)) {
    const prop = findProperty(properties, key);
    out[prop.id] = toCellValue(prop, value, refs);
  }
  return out;
}

// The emails, user ids and page references the cells mention, so the caller
// can look them up before converting.
export function cellReferences(
  properties: ToolProperty[],
  cellsList: Record<string, unknown>[],
): { users: string[]; pages: string[] } {
  const users = new Set<string>();
  const pages = new Set<string>();
  for (const cells of cellsList) {
    for (const [key, value] of Object.entries(cells ?? {})) {
      const prop = properties.find(
        (p) => p.id === key || norm(p.name) === norm(key),
      );
      if (!prop || value === null || value === undefined || value === '') {
        continue;
      }
      if (prop.type === 'person') {
        list(value).forEach((v) => users.add(norm(String(v))));
      } else if (prop.type === 'page') {
        pages.add(String(value).trim());
      }
    }
  }
  return { users: [...users], pages: [...pages] };
}

const OPS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'ncontains',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'before',
  'after',
  'onOrBefore',
  'onOrAfter',
  'any',
  'none',
  'all',
  'isWithin',
]);

// {property, op, value} or {op: "and"|"or", children} with names -> the
// engine's filter tree with property and choice ids.
export function toFilter(
  properties: ToolProperty[],
  filter: any,
  refs: CellRefs,
  depth = 0,
): any {
  if (depth > 5) throw invalid('The filter is nested too deeply');
  if (Array.isArray(filter)) {
    return {
      op: 'and',
      children: filter.map((f) => toFilter(properties, f, refs, depth + 1)),
    };
  }
  if (!filter || typeof filter !== 'object') {
    throw invalid('A filter is {property, op, value} or {op, children}');
  }
  if (filter.op === 'and' || filter.op === 'or') {
    return {
      op: filter.op,
      children: (filter.children ?? []).map((f: any) =>
        toFilter(properties, f, refs, depth + 1),
      ),
    };
  }
  const prop = findProperty(properties, String(filter.property ?? ''));
  const op = String(filter.op ?? 'eq');
  if (!OPS.has(op)) {
    throw invalid(
      `Unknown filter op "${op}". Ops: ${[...OPS].join(', ')}`,
    );
  }
  let value = filter.value;
  if (value !== undefined && value !== null) {
    if (CHOICE_TYPES.has(prop.type)) {
      value = Array.isArray(value)
        ? value.map((v) => choiceId(prop, v))
        : choiceId(prop, value);
    } else if (prop.type === 'person') {
      value = Array.isArray(value)
        ? value.map((v) => userId(prop, v, refs))
        : userId(prop, value, refs);
    }
  }
  return { propertyId: prop.id, op, ...(value !== undefined && { value }) };
}

export function filterReferences(filter: any, out: string[] = []): string[] {
  if (Array.isArray(filter)) filter.forEach((f) => filterReferences(f, out));
  else if (filter?.children) filterReferences(filter.children, out);
  else if (filter?.value !== undefined && filter?.value !== null) {
    list(filter.value).forEach((v) => out.push(norm(String(v))));
  }
  return out;
}

export function toSorts(
  properties: ToolProperty[],
  sorts: { property: string; direction?: string }[] = [],
) {
  return sorts.map((s) => ({
    propertyId: findProperty(properties, s.property).id,
    direction: s.direction === 'desc' ? 'desc' : 'asc',
  }));
}

// A row as the model reads it: cells by property name, readable values.
export function readRow(
  properties: ToolProperty[],
  row: ToolRow,
  refs: ReadRefs,
): { row_id: string; cells: Record<string, unknown> } {
  const cells = (row.cells ?? {}) as Record<string, unknown>;
  const person = (id: unknown) => {
    const user = refs.users[String(id)];
    return { id, name: user?.name ?? null };
  };
  const out: Record<string, unknown> = {};
  for (const prop of properties) {
    const raw = cells[prop.id];
    let value: unknown = raw ?? null;
    switch (prop.type) {
      case 'select':
      case 'status':
        value =
          raw == null
            ? null
            : (choicesOf(prop).find((c) => c.id === raw)?.name ?? null);
        break;
      case 'multiSelect':
        value = Array.isArray(raw)
          ? raw
              .map((id) => choicesOf(prop).find((c) => c.id === id)?.name)
              .filter(Boolean)
          : [];
        break;
      case 'person':
        value = Array.isArray(raw)
          ? raw.map(person)
          : raw == null
            ? null
            : person(raw);
        break;
      case 'page':
        value =
          raw == null
            ? null
            : { id: raw, title: refs.pages[String(raw)]?.title ?? null };
        break;
      case 'file':
        value = Array.isArray(raw) ? raw.map((f: any) => f?.fileName) : [];
        break;
      case 'createdAt':
        value = row.createdAt ?? null;
        break;
      case 'lastEditedAt':
        value = row.updatedAt ?? null;
        break;
      case 'lastEditedBy':
        value = row.lastUpdatedById ? person(row.lastUpdatedById) : null;
        break;
    }
    out[prop.name] = value;
  }
  return { row_id: row.id, cells: out };
}

// A property as the model needs to know it.
export function describeProperty(prop: ToolProperty) {
  return {
    id: prop.id,
    name: prop.name,
    type: prop.type,
    ...(CHOICE_TYPES.has(prop.type) && {
      choices: choicesOf(prop).map((c) => c.name),
    }),
    ...(prop.type === 'person' && {
      allow_multiple: !!prop.typeOptions?.allowMultiple,
    }),
    ...(READONLY_CELL_TYPES.has(prop.type) && { read_only: true }),
  };
}

const PALETTE = [
  'gray',
  'blue',
  'green',
  'yellow',
  'orange',
  'red',
  'violet',
  'cyan',
  'pink',
  'teal',
  'lime',
  'indigo',
  'grape',
];

// typeOptions for a new choice property from plain choice names.
export function choiceOptions(names: string[], makeId: () => string) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const choices = unique.map((name, i) => ({
    id: makeId(),
    name,
    color: PALETTE[i % PALETTE.length],
  }));
  return { choices, choiceOrder: choices.map((c) => c.id) };
}

