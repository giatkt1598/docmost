import { RawBuilder, sql } from 'kysely';
import { EngineProperty } from './base.types';
import { cellExpr, cellKindOf, escapeLike } from './cell-sql';

export const MAX_SEARCH_LENGTH = 200;

// Quick search: rows where any value contains the term (case-insensitive).
// Text-like cells match on their text, choices on their names, people on
// their user names and numbers on equality. Returns null for a blank term.
export function compileSearch(
  term: string | null | undefined,
  properties: Iterable<EngineProperty>,
): RawBuilder<boolean> | null {
  const needle = (term ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
  if (!needle) return null;
  const pattern = `%${escapeLike(needle)}%`;
  const lower = needle.toLowerCase();
  const asNumber = Number(needle.replace(/,/g, ''));

  const terms: RawBuilder<boolean>[] = [];
  for (const prop of properties) {
    const e = cellExpr(prop);
    switch (prop.type) {
      case 'text':
      case 'longText':
      case 'url':
      case 'email':
        terms.push(sql<boolean>`${e} ilike ${pattern}`);
        break;
      case 'formula':
        if (cellKindOf(prop) === 'text') {
          terms.push(sql<boolean>`${e} ilike ${pattern}`);
        } else if (cellKindOf(prop) === 'numeric' && Number.isFinite(asNumber)) {
          terms.push(sql<boolean>`${e} = ${asNumber}`);
        }
        break;
      case 'number':
        if (Number.isFinite(asNumber)) {
          terms.push(sql<boolean>`${e} = ${asNumber}`);
        }
        break;
      case 'select':
      case 'status':
      case 'multiSelect': {
        const ids = ((prop.typeOptions?.choices ?? []) as any[])
          .filter((c) => String(c?.name ?? '').toLowerCase().includes(lower))
          .map((c) => String(c.id));
        if (ids.length === 0) break;
        const list = sql`array[${sql.join(ids.map((id) => sql`${id}`))}]::text[]`;
        terms.push(
          prop.type === 'multiSelect'
            ? sql<boolean>`coalesce(${e} ?| ${list}, false)`
            : sql<boolean>`${e} = any(${list})`,
        );
        break;
      }
      case 'person':
        terms.push(
          cellKindOf(prop) === 'array'
            ? sql<boolean>`exists (select 1 from users u
                where u.id::text in (select jsonb_array_elements_text(
                  case when jsonb_typeof(${e}) = 'array' then ${e} else '[]'::jsonb end))
                and u.name ilike ${pattern})`
            : sql<boolean>`exists (select 1 from users u
                where u.id::text = ${e} and u.name ilike ${pattern})`,
        );
        break;
      case 'file':
        terms.push(
          sql<boolean>`exists (select 1 from jsonb_array_elements(
            case when jsonb_typeof(${e}) = 'array' then ${e} else '[]'::jsonb end) f
            where f ->> 'fileName' ilike ${pattern})`,
        );
        break;
    }
  }
  if (terms.length === 0) return sql<boolean>`false`;
  return sql<boolean>`(${sql.join(terms, sql` or `)})`;
}
