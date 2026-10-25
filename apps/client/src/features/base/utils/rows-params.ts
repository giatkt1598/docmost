import { RowQuery } from "@/features/base/types/base.types";

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
  return out;
}
