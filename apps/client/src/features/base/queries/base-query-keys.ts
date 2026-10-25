import { RowQuery } from "@/features/base/types/base.types";
import { normalizeRowQuery } from "@/features/base/utils/rows-params";

export const baseKeys = {
  all: ["bases"] as const,
  list: (spaceId: string) => ["bases", "list", spaceId] as const,
  info: (pageId: string) => ["bases", "info", pageId] as const,
  // prefix of every cached row list of a base
  rowsRoot: (pageId: string) => ["bases", "rows", pageId] as const,
  rows: (pageId: string, params: RowQuery = {}) =>
    ["bases", "rows", pageId, normalizeRowQuery(params)] as const,
  row: (pageId: string, rowId: string) =>
    ["bases", "row", pageId, rowId] as const,
  // formula properties being recomputed in the background
  formulaJobs: (pageId: string) => ["bases", "formula-jobs", pageId] as const,
  publicInfo: (pageId: string, access: unknown) =>
    ["bases", "public-info", pageId, access] as const,
  publicRows: (pageId: string, access: unknown, params: RowQuery = {}) =>
    ["bases", "public-rows", pageId, access, normalizeRowQuery(params)] as const,
};

// The params a rows query key was built with.
export function rowQueryOfKey(key: readonly unknown[]): RowQuery {
  return (key[3] as RowQuery) ?? {};
}
