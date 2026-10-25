import { RawBuilder, sql } from 'kysely';
import { EngineProperty, SortSpec } from './base.types';
import { cellExpr, cellKindOf } from './cell-sql';

export class SortCompileError extends Error {}

export type CompiledSort = {
  expr: RawBuilder<any>;
  direction: 'asc' | 'desc';
};

// Expression used to order rows by a property. Choices sort by their position
// in the choice list; people by name; text case-insensitively.
export function sortExpr(prop: EngineProperty): RawBuilder<any> {
  const raw = cellExpr(prop);
  switch (prop.type) {
    case 'select':
    case 'status': {
      const order: string[] = prop.typeOptions?.choiceOrder ?? [];
      if (order.length === 0) return raw;
      return sql`array_position(array[${sql.join(order.map((id) => sql`${id}`))}]::text[], ${raw})`;
    }
    case 'person':
    case 'lastEditedBy': {
      if (cellKindOf(prop) === 'array') return sql`null`;
      return sql`(select lower(u.name) from users u where u.id::text = ${raw})`;
    }
    case 'multiSelect':
    case 'file':
      return sql`${raw}::text`;
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
      return sql`lower(${raw})`;
    case 'formula':
      return cellKindOf(prop) === 'text' ? sql`lower(${raw})` : raw;
    default:
      return raw;
  }
}

export function compileSorts(
  sorts: SortSpec[] | undefined,
  properties: ReadonlyMap<string, EngineProperty>,
): CompiledSort[] {
  const out: CompiledSort[] = [];
  const seen = new Set<string>();
  for (const s of sorts ?? []) {
    if (seen.has(s.propertyId)) continue;
    seen.add(s.propertyId);
    const prop = properties.get(s.propertyId);
    if (!prop) throw new SortCompileError(`Unknown property ${s.propertyId}`);
    if (prop.type === 'page') {
      throw new SortCompileError('Page properties cannot be sorted');
    }
    out.push({ expr: sortExpr(prop), direction: s.direction });
  }
  return out;
}
