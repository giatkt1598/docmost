import { z } from 'zod';
import {
  BASE_PROPERTY_TYPES,
  BASE_VIEW_TYPES,
  CHOICE_TYPES,
  EngineProperty,
  MAX_LONG_TEXT_LENGTH,
  MAX_TEXT_LENGTH,
  READONLY_CELL_TYPES,
} from './base.types';

export const FILTER_OPERATORS = [
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
] as const;

const MAX_FILTER_DEPTH = 6;
const MAX_FILTER_NODES = 100;

const conditionSchema = z.object({
  propertyId: z.string().min(1).max(64),
  op: z.enum(FILTER_OPERATORS),
  value: z.unknown().optional(),
});

type FilterInput =
  | z.infer<typeof conditionSchema>
  | { op: 'and' | 'or'; children: FilterInput[] };

export const filterSchema: z.ZodType<FilterInput> = z.lazy(() =>
  z.union([
    z.object({
      op: z.enum(['and', 'or']),
      children: z.array(filterSchema).max(MAX_FILTER_NODES),
    }),
    conditionSchema,
  ]),
);

export const sortsSchema = z
  .array(
    z.object({
      propertyId: z.string().min(1).max(64),
      direction: z.enum(['asc', 'desc']),
    }),
  )
  .max(10);

export function parseFilter(input: unknown) {
  const parsed = filterSchema.parse(input);
  let nodes = 0;
  const walk = (n: any, depth: number) => {
    if (depth > MAX_FILTER_DEPTH) throw new Error('Filter is nested too deeply');
    if (++nodes > MAX_FILTER_NODES) throw new Error('Filter is too large');
    if (n.children) for (const c of n.children) walk(c, depth + 1);
  };
  walk(parsed, 1);
  return parsed;
}

export function parseSorts(input: unknown) {
  return sortsSchema.parse(input);
}

// ---- type options -------------------------------------------------------

const choiceSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(200),
  color: z.string().max(32),
  category: z.enum(['todo', 'inProgress', 'complete']).optional(),
});

const choiceOptionsSchema = z
  .object({
    choices: z.array(choiceSchema).max(500).default([]),
    choiceOrder: z.array(z.string()).max(500).default([]),
    disableColors: z.boolean().optional(),
    defaultValue: z
      .union([z.string(), z.array(z.string()), z.null()])
      .optional(),
  })
  .passthrough();

const textOptionsSchema = z
  .object({
    richText: z.boolean().optional(),
    defaultValue: z.string().nullable().optional(),
  })
  .passthrough();

const numberOptionsSchema = z
  .object({
    format: z.enum(['plain', 'currency', 'percent', 'progress']).optional(),
    separators: z
      .enum([
        'none',
        'local',
        'comma_period',
        'period_comma',
        'space_comma',
        'space_period',
      ])
      .optional(),
    precision: z.number().int().min(0).max(20).optional(),
    currencyCode: z.string().max(8).optional(),
    currencySymbol: z.string().max(8).optional(),
    defaultValue: z.number().nullable().optional(),
  })
  .passthrough();

const dateDisplayOptions = {
  dateFormat: z.string().max(64).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  includeTime: z.boolean().optional(),
};

const dateOptionsSchema = z
  .object({
    ...dateDisplayOptions,
    defaultValue: z.string().nullable().optional(),
  })
  .passthrough();

// createdAt / lastEditedAt: display options only, no stored value
const systemDateOptionsSchema = z.object(dateDisplayOptions).passthrough();

const personOptionsSchema = z
  .object({
    allowMultiple: z.boolean().optional(),
    defaultValue: z
      .union([z.string(), z.array(z.string()), z.null()])
      .optional(),
  })
  .passthrough();

const checkboxOptionsSchema = z
  .object({ defaultValue: z.boolean().optional() })
  .passthrough();

const simpleDefaultSchema = z
  .object({ defaultValue: z.string().nullable().optional() })
  .passthrough();

const emptyOptionsSchema = z.object({}).passthrough();

export function typeOptionsSchemaFor(type: string): z.ZodTypeAny {
  switch (type) {
    case 'text':
    case 'longText':
      return textOptionsSchema;
    case 'number':
      return numberOptionsSchema;
    case 'select':
    case 'status':
    case 'multiSelect':
      return choiceOptionsSchema;
    case 'date':
      return dateOptionsSchema;
    case 'createdAt':
    case 'lastEditedAt':
      return systemDateOptionsSchema;
    case 'person':
      return personOptionsSchema;
    case 'checkbox':
      return checkboxOptionsSchema;
    case 'url':
    case 'email':
      return simpleDefaultSchema;
    default:
      return emptyOptionsSchema;
  }
}

// Validates and normalizes typeOptions for a property type. Choice options
// get unique ids and a choiceOrder that matches the choices exactly.
export function normalizeTypeOptions(type: string, input: unknown): any {
  if (!(BASE_PROPERTY_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unknown property type "${type}"`);
  }
  if (type === 'formula') {
    // validated by the formula service
    return input ?? {};
  }
  const parsed = typeOptionsSchemaFor(type).parse(input ?? {}) as any;
  if (CHOICE_TYPES.has(type)) {
    const seen = new Set<string>();
    for (const c of parsed.choices) {
      if (seen.has(c.id)) throw new Error('Duplicate choice id');
      seen.add(c.id);
    }
    const order = (parsed.choiceOrder as string[]).filter((id) =>
      seen.has(id),
    );
    for (const c of parsed.choices) {
      if (!order.includes(c.id)) order.push(c.id);
    }
    parsed.choiceOrder = order;
  }
  return parsed;
}

export const viewConfigSchema = z
  .object({
    sorts: sortsSchema.optional(),
    filter: filterSchema.optional(),
    visiblePropertyIds: z.array(z.string()).max(500).optional(),
    hiddenPropertyIds: z.array(z.string()).max(500).optional(),
    propertyWidths: z.record(z.string(), z.number()).optional(),
    propertyOrder: z.array(z.string()).max(500).optional(),
    groupByPropertyId: z.string().max(64).optional(),
    hiddenChoiceIds: z.array(z.string()).max(500).optional(),
    choiceOrder: z.array(z.string()).max(501).optional(),
    // display preference of the view, shared by everyone: use the whole
    // content area instead of the page column width
    fullWidth: z.boolean().optional(),
  })
  .strict();

export function parseViewType(type: unknown) {
  return z.enum(BASE_VIEW_TYPES).parse(type);
}

// ---- cells --------------------------------------------------------------

const fileSchema = z.object({
  id: z.string().min(1).max(64),
  fileName: z.string().max(512),
  mimeType: z.string().max(255).optional(),
  fileSize: z.number().optional(),
  url: z.string().max(2048).optional(),
});

const ISO_DATE = z
  .string()
  .max(64)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

function cellSchemaFor(prop: EngineProperty): z.ZodTypeAny {
  const opts = prop.typeOptions ?? {};
  switch (prop.type) {
    case 'text':
    case 'url':
    case 'email':
      return z.string().max(MAX_TEXT_LENGTH);
    case 'longText':
      return z.string().max(MAX_LONG_TEXT_LENGTH);
    case 'number':
      return z.number().finite();
    case 'checkbox':
      return z.boolean();
    case 'date':
      return ISO_DATE;
    case 'select':
    case 'status': {
      const ids = new Set<string>((opts.choices ?? []).map((c: any) => c.id));
      return z.string().refine((v) => ids.has(v), 'Unknown choice');
    }
    case 'multiSelect': {
      const ids = new Set<string>((opts.choices ?? []).map((c: any) => c.id));
      return z
        .array(z.string().refine((v) => ids.has(v), 'Unknown choice'))
        .max(500);
    }
    case 'person':
      return opts.allowMultiple
        ? z.array(z.string().uuid()).max(200)
        : z.string().uuid();
    case 'page':
      return z.string().min(1).max(64);
    case 'file':
      return z.array(fileSchema).max(100);
    default:
      return z.never();
  }
}

export class CellValidationError extends Error {}

// Validates a propertyId -> value patch against the live schema. A null
// value means "clear the cell" and is always allowed for writable types.
export function validateCells(
  cells: Record<string, unknown>,
  properties: ReadonlyMap<string, EngineProperty>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [propId, value] of Object.entries(cells ?? {})) {
    const prop = properties.get(propId);
    if (!prop) throw new CellValidationError(`Unknown property ${propId}`);
    if (READONLY_CELL_TYPES.has(prop.type)) {
      throw new CellValidationError(
        `Property ${propId} (${prop.type}) is read-only`,
      );
    }
    if (value === null || value === undefined) {
      out[propId] = null;
      continue;
    }
    // Blank text clears the cell, like the client does.
    if (typeof value === 'string' && value === '') {
      out[propId] = null;
      continue;
    }
    const res = cellSchemaFor(prop).safeParse(value);
    if (!res.success) {
      throw new CellValidationError(
        `Invalid value for property ${propId}: ${res.error.issues[0]?.message}`,
      );
    }
    out[propId] = res.data;
  }
  return out;
}

// Default cell values for a new row, from each property defaultValue.
export function defaultCells(
  properties: Iterable<EngineProperty>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of properties) {
    if (READONLY_CELL_TYPES.has(p.type)) continue;
    const dv = p.typeOptions?.defaultValue;
    if (dv === undefined || dv === null) continue;
    if (p.type === 'checkbox' && dv !== true) continue;
    out[p.id] = dv;
  }
  return out;
}
