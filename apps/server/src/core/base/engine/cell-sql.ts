import { RawBuilder, sql } from 'kysely';
import { EngineProperty } from './base.types';

// SQL expressions that read a property out of a base_rows row. These use the
// snake_case column names because they are raw fragments (no CamelCasePlugin).

export type CellKind =
  | 'text'
  | 'numeric'
  | 'bool'
  | 'timestamptz'
  | 'array'
  | 'userId';

export function cellKindOf(prop: EngineProperty): CellKind {
  switch (prop.type) {
    case 'number':
      return 'numeric';
    case 'checkbox':
      return 'bool';
    case 'date':
    case 'createdAt':
    case 'lastEditedAt':
      return 'timestamptz';
    case 'multiSelect':
    case 'file':
      return 'array';
    case 'person':
      return prop.typeOptions?.allowMultiple ? 'array' : 'text';
    case 'lastEditedBy':
      return 'userId';
    case 'formula': {
      const rt = prop.typeOptions?.resultType;
      if (rt === 'number') return 'numeric';
      if (rt === 'boolean') return 'bool';
      if (rt === 'date') return 'timestamptz';
      return 'text';
    }
    default:
      return 'text';
  }
}

export function cellExpr(prop: EngineProperty): RawBuilder<any> {
  switch (prop.type) {
    case 'createdAt':
      return sql`base_rows.created_at`;
    case 'lastEditedAt':
      return sql`base_rows.updated_at`;
    case 'lastEditedBy':
      return sql`coalesce(base_rows.last_updated_by_id, base_rows.creator_id)::text`;
  }
  switch (cellKindOf(prop)) {
    case 'numeric':
      return sql`base_cell_numeric(base_rows.cells, ${prop.id})`;
    case 'bool':
      return sql`base_cell_bool(base_rows.cells, ${prop.id})`;
    case 'timestamptz':
      return sql`base_cell_timestamptz(base_rows.cells, ${prop.id})`;
    case 'array':
      return sql`base_cell_array(base_rows.cells, ${prop.id})`;
    default:
      return sql`base_cell_text(base_rows.cells, ${prop.id})`;
  }
}

// True when the cell holds nothing: absent, blank text or an empty array.
export function isEmptyExpr(prop: EngineProperty): RawBuilder<boolean> {
  const e = cellExpr(prop);
  switch (cellKindOf(prop)) {
    case 'array':
      return sql<boolean>`(${e} is null or (case when jsonb_typeof(${e}) = 'array' then jsonb_array_length(${e}) = 0 else false end))`;
    case 'text':
      return sql<boolean>`(${e} is null or btrim(${e}) = '')`;
    default:
      return sql<boolean>`(${e} is null)`;
  }
}

export function escapeLike(value: string): string {
  return value.replace(/[\%_]/g, (c) => `\${c}`);
}
