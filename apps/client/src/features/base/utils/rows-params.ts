import { FilterCondition, GroupColumn, RowFilter, RowQuery } from "@/features/base/types/base.types";

// Drops empty filters and blank searches so equal queries share a cache key
// and the server gets no useless conditions.
export function normalizeRowQuery(params: RowQuery): RowQuery {
  const out: RowQuery = {};
  if (params.filter && params.filter.children?.length) {
    out.filter = params.filter;
  }
  if (params.sorts?.length) out.sorts = params.sorts;
  const search = params.search?.trim();
  if (search) out.search = search;
  if (params.column) {
    out.column = { propertyId: params.column.propertyId, value: params.column.value ?? null };
  }
  return out;
}

export function columnCondition(column: GroupColumn): FilterCondition {
  return column.value === null
    ? { propertyId: column.propertyId, op: "isEmpty" }
    : { propertyId: column.propertyId, op: "any", value: [column.value] };
}

// The view filter AND the column condition.
export function withColumnFilter(
  filter: RowFilter | undefined,
  column: GroupColumn | undefined,
): RowFilter | undefined {
  if (!column) return filter;
  const cond = columnCondition(column);
  if (!filter?.children?.length) return { op: "and", children: [cond] };
  return { op: "and", children: [filter, cond] };
}

// What the rows endpoints receive for a query.
export function toRequestQuery(params: RowQuery): Omit<RowQuery, "column"> {
  const { column, ...rest } = normalizeRowQuery(params);
  const filter = withColumnFilter(rest.filter, column);
  return { ...rest, ...(filter ? { filter } : {}) };
}
