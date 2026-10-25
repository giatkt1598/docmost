import { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import {
  CellMap,
  RowsChunk,
  BaseRow,
  RowReferenceMap,
  RowQuery,
} from "@/features/base/types/base.types";
import { baseKeys, rowQueryOfKey } from "@/features/base/queries/base-query-keys";
import { comparePositions } from "@/features/base/utils/position";

// One place that writes rows into the cached row lists of a base. Every
// list (one per filter / sorts / search) is updated by row id, so a row is
// never listed twice, whatever order mutations, refetches and socket events
// arrive in.

export type RowsData = InfiniteData<RowsChunk, unknown>;

// Decides whether a row that is not in a list yet belongs there. By default
// only lists without filter and search take new rows (the client cannot
// evaluate filters); callers that know better pass their own predicate.
export type InsertPolicy = (params: RowQuery, row: BaseRow) => boolean;

export const defaultInsertPolicy: InsertPolicy = (params) =>
  !params.filter && !params.search;

export const insertEverywhere: InsertPolicy = () => true;

// ---- pure helpers on one list --------------------------------------------

export function flattenRows(data: RowsData | undefined): BaseRow[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: BaseRow[] = [];
  for (const page of data.pages) {
    for (const row of page.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

export function mergeReferences(
  pages: Array<{ references?: RowReferenceMap }>,
): RowReferenceMap {
  const out: RowReferenceMap = { users: {}, pages: {} };
  for (const p of pages) {
    Object.assign(out.users, p.references?.users);
    Object.assign(out.pages, p.references?.pages);
  }
  return out;
}

export function findRowInData(
  data: RowsData | undefined,
  rowId: string,
): BaseRow | undefined {
  for (const page of data?.pages ?? []) {
    const row = page.items.find((r) => r.id === rowId);
    if (row) return row;
  }
  return undefined;
}

function withPages(data: RowsData, pages: RowsChunk[]): RowsData {
  return { ...data, pages };
}

export function removeRowsFromData(
  data: RowsData,
  rowIds: Iterable<string>,
): RowsData {
  const ids = new Set(rowIds);
  let changed = false;
  const pages = data.pages.map((page) => {
    const items = page.items.filter((r) => !ids.has(r.id));
    if (items.length === page.items.length) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? withPages(data, pages) : data;
}

// Inserts a row by position among the loaded rows. A row that sorts after
// every loaded row is left for a later page when there is one.
function insertByPosition(data: RowsData, row: BaseRow): RowsData {
  const pages = data.pages;
  for (let p = 0; p < pages.length; p++) {
    const items = pages[p].items;
    const idx = items.findIndex(
      (r) => comparePositions(r.position, row.position) > 0,
    );
    if (idx >= 0) {
      const next = [...items.slice(0, idx), row, ...items.slice(idx)];
      return withPages(
        data,
        pages.map((page, i) => (i === p ? { ...page, items: next } : page)),
      );
    }
  }
  return appendRow(data, row, false);
}

function appendRow(data: RowsData, row: BaseRow, evenIfMore: boolean): RowsData {
  const last = data.pages.length - 1;
  if (last < 0) return data;
  if (data.pages[last].meta?.hasNextPage && !evenIfMore) return data;
  return withPages(
    data,
    data.pages.map((page, i) =>
      i === last ? { ...page, items: [...page.items, row] } : page,
    ),
  );
}

function replaceFirst(data: RowsData, row: BaseRow): RowsData {
  let done = false;
  const pages = data.pages.map((page) => {
    if (!page.items.some((r) => r.id === row.id)) return page;
    const items: BaseRow[] = [];
    for (const r of page.items) {
      if (r.id !== row.id) items.push(r);
      else if (!done) {
        items.push(row);
        done = true;
      }
      // later copies are dropped
    }
    return { ...page, items };
  });
  return withPages(data, pages);
}

// Inserts or replaces rows by id in one list.
export function upsertRowsInData(
  data: RowsData,
  rows: BaseRow[],
  params: RowQuery,
  insert: InsertPolicy = defaultInsertPolicy,
): RowsData {
  let out = data;
  const sorted = !!params.sorts?.length;
  for (const row of rows) {
    const existing = findRowInData(out, row.id);
    if (existing) {
      if (!sorted && existing.position !== row.position) {
        // keep manual order: move it to its new place
        out = insertByPosition(removeRowsFromData(out, [row.id]), row);
      } else {
        out = replaceFirst(out, row);
      }
      continue;
    }
    if (!insert(params, row)) continue;
    out = sorted ? appendRow(out, row, true) : insertByPosition(out, row);
  }
  return out;
}

// Applies a cell patch the way the server does: null removes the key.
export function applyCellPatch(cells: CellMap, patch: CellMap): CellMap {
  const out = { ...cells };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

export function updateRowInData(
  data: RowsData,
  rowId: string,
  update: (row: BaseRow) => BaseRow,
): RowsData {
  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page.items.some((r) => r.id === rowId)) return page;
    changed = true;
    return {
      ...page,
      items: page.items.map((r) => (r.id === rowId ? update(r) : r)),
    };
  });
  return changed ? withPages(data, pages) : data;
}

export function moveRowInData(
  data: RowsData,
  rowId: string,
  position: string,
  params: RowQuery,
): RowsData {
  const existing = findRowInData(data, rowId);
  if (!existing || existing.position === position) return data;
  const moved = { ...existing, position };
  if (params.sorts?.length) return updateRowInData(data, rowId, () => moved);
  return insertByPosition(removeRowsFromData(data, [rowId]), moved);
}

// ---- query client wrappers -------------------------------------------------

function eachRowsQuery(
  qc: QueryClient,
  pageId: string,
  fn: (data: RowsData, params: RowQuery) => RowsData,
) {
  const entries = qc.getQueriesData<RowsData>({
    queryKey: baseKeys.rowsRoot(pageId),
  });
  for (const [key, data] of entries) {
    if (!data?.pages) continue;
    const next = fn(data, rowQueryOfKey(key));
    if (next !== data) qc.setQueryData(key, next);
  }
}

export function getCachedRow(
  qc: QueryClient,
  pageId: string,
  rowId: string,
): BaseRow | undefined {
  const single = qc.getQueryData<BaseRow>(baseKeys.row(pageId, rowId));
  if (single) return single;
  for (const [, data] of qc.getQueriesData<RowsData>({
    queryKey: baseKeys.rowsRoot(pageId),
  })) {
    const row = findRowInData(data, rowId);
    if (row) return row;
  }
  return undefined;
}

export function isRowCached(qc: QueryClient, pageId: string, rowId: string) {
  return !!getCachedRow(qc, pageId, rowId);
}

export function upsertRows(
  qc: QueryClient,
  pageId: string,
  rows: BaseRow[],
  insert: InsertPolicy = defaultInsertPolicy,
) {
  if (rows.length === 0) return;
  eachRowsQuery(qc, pageId, (data, params) =>
    upsertRowsInData(data, rows, params, insert),
  );
  for (const row of rows) {
    if (qc.getQueryData(baseKeys.row(pageId, row.id))) {
      qc.setQueryData(baseKeys.row(pageId, row.id), row);
    }
  }
}

export function removeRows(qc: QueryClient, pageId: string, rowIds: string[]) {
  if (rowIds.length === 0) return;
  eachRowsQuery(qc, pageId, (data) => removeRowsFromData(data, rowIds));
  for (const id of rowIds) {
    qc.removeQueries({ queryKey: baseKeys.row(pageId, id), exact: true });
  }
}

export function patchRow(
  qc: QueryClient,
  pageId: string,
  rowId: string,
  update: (row: BaseRow) => BaseRow,
) {
  eachRowsQuery(qc, pageId, (data) => updateRowInData(data, rowId, update));
  const single = qc.getQueryData<BaseRow>(baseKeys.row(pageId, rowId));
  if (single) qc.setQueryData(baseKeys.row(pageId, rowId), update(single));
}

export function patchRowCells(
  qc: QueryClient,
  pageId: string,
  rowId: string,
  cells: CellMap,
) {
  patchRow(qc, pageId, rowId, (row) => ({
    ...row,
    cells: applyCellPatch(row.cells ?? {}, cells),
  }));
}

export function moveRow(
  qc: QueryClient,
  pageId: string,
  rowId: string,
  position: string,
) {
  eachRowsQuery(qc, pageId, (data, params) =>
    moveRowInData(data, rowId, position, params),
  );
  const single = qc.getQueryData<BaseRow>(baseKeys.row(pageId, rowId));
  if (single) {
    qc.setQueryData(baseKeys.row(pageId, rowId), { ...single, position });
  }
}

// Snapshot of every row list of a base, to roll back an optimistic update.
export type RowsSnapshot = Array<[QueryKey, unknown]>;

export function snapshotRows(qc: QueryClient, pageId: string): RowsSnapshot {
  return [
    ...qc.getQueriesData({ queryKey: baseKeys.rowsRoot(pageId) }),
    ...qc.getQueriesData({ queryKey: ["bases", "row", pageId] }),
  ];
}

export function restoreRowsSnapshot(qc: QueryClient, snapshot: RowsSnapshot) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}
