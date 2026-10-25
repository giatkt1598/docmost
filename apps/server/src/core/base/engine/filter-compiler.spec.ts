import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  RawBuilder,
} from 'kysely';
import { compileFilter, FilterCompileError } from './filter-compiler';
import { compileSorts, SortCompileError } from './sort-compiler';
import { resolveDateFilterValue } from './date-range';
import { EngineProperty } from './base.types';

const db = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (k) => new PostgresIntrospector(k),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const sqlOf = (expr: RawBuilder<any>) => {
  const c = expr.compile(db);
  return { sql: c.sql, params: c.parameters };
};

const props = new Map<string, EngineProperty>(
  [
    { id: 'title', type: 'text', typeOptions: {} },
    { id: 'qty', type: 'number', typeOptions: {} },
    { id: 'done', type: 'checkbox', typeOptions: {} },
    { id: 'st', type: 'status', typeOptions: { choiceOrder: ['a', 'b'] } },
    { id: 'tags', type: 'multiSelect', typeOptions: {} },
    { id: 'due', type: 'date', typeOptions: {} },
    { id: 'files', type: 'file', typeOptions: {} },
    { id: 'pg', type: 'page', typeOptions: {} },
  ].map((p) => [p.id, p]),
);
const NOW = new Date('2024-03-13T15:00:00Z'); // a Wednesday

describe('compileFilter', () => {
  it('matches everything without a filter or with an empty group', () => {
    expect(sqlOf(compileFilter(null, props)).sql).toBe('true');
    expect(sqlOf(compileFilter({ op: 'and', children: [] }, props)).sql).toBe('true');
  });

  it('binds values instead of inlining them', () => {
    const { sql, params } = sqlOf(
      compileFilter({ propertyId: 'title', op: 'eq', value: "x'; drop table" }, props),
    );
    expect(sql).not.toContain('drop');
    expect(params).toContain("x'; drop table");
  });

  it('escapes LIKE wildcards', () => {
    const { params } = sqlOf(
      compileFilter({ propertyId: 'title', op: 'contains', value: '50%_' }, props),
    );
    expect(params).toContain('%50\\%\\_%');
  });

  it('coerces numbers and rejects garbage', () => {
    const { params } = sqlOf(compileFilter({ propertyId: 'qty', op: 'gt', value: '12' }, props));
    expect(params).toContain(12);
    expect(() =>
      compileFilter({ propertyId: 'qty', op: 'gt', value: 'abc' }, props),
    ).toThrow(FilterCompileError);
  });

  it('treats a missing checkbox as unchecked', () => {
    const { sql } = sqlOf(compileFilter({ propertyId: 'done', op: 'eq', value: 'false' }, props));
    expect(sql).toContain('coalesce');
  });

  it('joins groups with and / or', () => {
    const { sql } = sqlOf(
      compileFilter(
        {
          op: 'or',
          children: [
            { propertyId: 'title', op: 'isEmpty' },
            { propertyId: 'st', op: 'any', value: ['a', 'b'] },
          ],
        },
        props,
      ),
    );
    expect(sql).toContain(' or ');
  });

  it('uses jsonb operators for multi select and file cells', () => {
    expect(
      sqlOf(compileFilter({ propertyId: 'tags', op: 'any', value: ['a'] }, props)).sql,
    ).toContain('?|');
    expect(
      sqlOf(compileFilter({ propertyId: 'tags', op: 'all', value: ['a'] }, props)).sql,
    ).toContain('?&');
    expect(
      sqlOf(compileFilter({ propertyId: 'files', op: 'isEmpty' }, props)).sql,
    ).toContain('jsonb_array_length');
  });

  it('rejects unknown properties and unsupported operators', () => {
    expect(() =>
      compileFilter({ propertyId: 'nope', op: 'eq', value: 1 }, props),
    ).toThrow(FilterCompileError);
    expect(() =>
      compileFilter({ propertyId: 'pg', op: 'gt', value: 'x' }, props),
    ).toThrow(FilterCompileError);
  });

  it('turns date filters into ranges', () => {
    const { params } = sqlOf(
      compileFilter(
        { propertyId: 'due', op: 'isWithin', value: { mode: 'range', preset: 'thisWeek' } },
        props,
        NOW,
      ),
    );
    expect(params).toEqual(
      expect.arrayContaining(['2024-03-11T00:00:00.000Z', '2024-03-18T00:00:00.000Z']),
    );
  });
});

describe('resolveDateFilterValue', () => {
  it('resolves relative anchors to a whole day', () => {
    const r = resolveDateFilterValue({ mode: 'relative', preset: 'tomorrow' }, 'eq', NOW);
    expect(r.start.toISOString()).toBe('2024-03-14T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('resolves past and next ranges', () => {
    const past = resolveDateFilterValue({ mode: 'range', preset: 'pastWeek' }, 'isWithin', NOW);
    expect(past.start.toISOString()).toBe('2024-03-06T00:00:00.000Z');
    expect(past.end.toISOString()).toBe('2024-03-14T00:00:00.000Z');
    const next = resolveDateFilterValue({ mode: 'range', preset: 'nextMonth' }, 'isWithin', NOW);
    expect(next.start.toISOString()).toBe('2024-04-01T00:00:00.000Z');
    expect(next.end.toISOString()).toBe('2024-05-01T00:00:00.000Z');
  });

  it('rejects bad values', () => {
    expect(() => resolveDateFilterValue({ mode: 'exact', date: 'x' }, 'eq', NOW)).toThrow();
    expect(() => resolveDateFilterValue('nope', 'eq', NOW)).toThrow();
  });
});

describe('compileSorts', () => {
  it('orders choices by their position in the choice list', () => {
    const [s] = compileSorts([{ propertyId: 'st', direction: 'asc' }], props);
    expect(sqlOf(s.expr).sql).toContain('array_position');
  });

  it('skips duplicates and rejects unknown or page properties', () => {
    expect(
      compileSorts(
        [
          { propertyId: 'qty', direction: 'asc' },
          { propertyId: 'qty', direction: 'desc' },
        ],
        props,
      ),
    ).toHaveLength(1);
    expect(() => compileSorts([{ propertyId: 'zz', direction: 'asc' }], props)).toThrow(SortCompileError);
    expect(() => compileSorts([{ propertyId: 'pg', direction: 'asc' }], props)).toThrow(SortCompileError);
  });
});
