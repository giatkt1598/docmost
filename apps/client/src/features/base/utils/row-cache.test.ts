import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { RowsChunk, BaseRow } from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import {
  applyCellPatch,
  flattenRows,
  getCachedRow,
  insertEverywhere,
  mergeReferences,
  moveRow,
  moveRowInData,
  patchRowCells,
  removeRows,
  restoreRowsSnapshot,
  RowsData,
  snapshotRows,
  upsertRows,
  upsertRowsInData,
} from "./row-cache";

const row = (id: string, position: string, cells: Record<string, unknown> = {}): BaseRow => ({
  id,
  pageId: "base",
  workspaceId: "ws",
  cells,
  position,
  creatorId: null,
  lastUpdatedById: null,
  docPageId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
});

const page = (items: BaseRow[], hasNextPage = false): RowsChunk => ({
  items,
  meta: {
    limit: 100,
    hasNextPage,
    hasPrevPage: false,
    nextCursor: hasNextPage ? "c" : null,
    prevCursor: null,
  },
  references: { users: {}, pages: {} },
});

const data = (...pages: RowsChunk[]): RowsData => ({
  pages,
  pageParams: pages.map((_, i) => (i === 0 ? undefined : `c${i}`)),
});

const ids = (d: RowsData) => d.pages.map((p) => p.items.map((r) => r.id));

describe("upsertRowsInData", () => {
  const base = data(page([row("a", "a0"), row("c", "a2")]));

  it("replaces an existing row in place", () => {
    const out = upsertRowsInData(base, [row("c", "a2", { x: 1 })], {});
    expect(ids(out)).toEqual([["a", "c"]]);
    expect(out.pages[0].items[1].cells).toEqual({ x: 1 });
  });

  it("inserts a new row by position in unsorted lists", () => {
    expect(ids(upsertRowsInData(base, [row("b", "a1")], {}))).toEqual([["a", "b", "c"]]);
    expect(ids(upsertRowsInData(base, [row("z", "a9")], {}))).toEqual([["a", "c", "z"]]);
  });

  it("leaves rows past the loaded range for a later page", () => {
    const partial = data(page([row("a", "a0")], true));
    expect(upsertRowsInData(partial, [row("z", "a9")], {})).toBe(partial);
    // but inserts rows that fall inside it
    expect(ids(upsertRowsInData(partial, [row("0", "Zz")], {}))).toEqual([["0", "a"]]);
  });

  it("does not insert into filtered or searched lists by default", () => {
    const filter = { op: "and" as const, children: [{ propertyId: "p", op: "eq" as const, value: 1 }] };
    expect(upsertRowsInData(base, [row("b", "a1")], { filter })).toBe(base);
    expect(upsertRowsInData(base, [row("b", "a1")], { search: "x" })).toBe(base);
    expect(
      ids(upsertRowsInData(base, [row("b", "a1")], { search: "x" }, insertEverywhere)),
    ).toEqual([["a", "b", "c"]]);
  });

  it("appends new rows at the end of sorted lists", () => {
    const sorts = [{ propertyId: "p", direction: "asc" as const }];
    const partial = data(page([row("a", "a5")], true));
    expect(ids(upsertRowsInData(partial, [row("b", "a0")], { sorts }))).toEqual([["a", "b"]]);
  });

  it("never lists a row twice, even if the cache already had duplicates", () => {
    const dup = data(page([row("a", "a0"), row("b", "a1")]), page([row("b", "a1"), row("c", "a2")]));
    const out = upsertRowsInData(dup, [row("b", "a1", { v: 2 })], {});
    expect(ids(out)).toEqual([["a", "b"], ["c"]]);
    expect(flattenRows(out).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("is idempotent", () => {
    const once = upsertRowsInData(base, [row("b", "a1")], {});
    const twice = upsertRowsInData(once, [row("b", "a1")], {});
    expect(ids(twice)).toEqual([["a", "b", "c"]]);
  });

  it("moves a replaced row whose position changed", () => {
    const out = upsertRowsInData(base, [row("a", "a5")], {});
    expect(ids(out)).toEqual([["c", "a"]]);
  });
});

describe("moveRowInData", () => {
  it("reorders unsorted lists and only updates sorted ones", () => {
    const d = data(page([row("a", "a0"), row("b", "a1"), row("c", "a2")]));
    expect(ids(moveRowInData(d, "c", "a05", {}))).toEqual([["a", "c", "b"]]);
    const sorted = moveRowInData(d, "c", "a05", {
      sorts: [{ propertyId: "p", direction: "asc" }],
    });
    expect(ids(sorted)).toEqual([["a", "b", "c"]]);
    expect(sorted.pages[0].items[2].position).toBe("a05");
    expect(moveRowInData(d, "missing", "a9", {})).toBe(d);
  });
});

describe("flattenRows / mergeReferences / applyCellPatch", () => {
  it("flattens pages without duplicates", () => {
    expect(flattenRows(undefined)).toEqual([]);
    const d = data(page([row("a", "a0")]), page([row("a", "a0"), row("b", "a1")]));
    expect(flattenRows(d).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("merges references of every page", () => {
    const p1 = { references: { users: { u1: { id: "u1", name: "A", avatarUrl: null } }, pages: {} } };
    const p2 = { references: { users: {}, pages: { pg: { id: "pg", slugId: "s", title: "T", icon: null, spaceId: "sp", space: null } } } };
    const refs = mergeReferences([p1, p2, {}]);
    expect(Object.keys(refs.users)).toEqual(["u1"]);
    expect(Object.keys(refs.pages)).toEqual(["pg"]);
  });

  it("removes keys patched with null", () => {
    expect(applyCellPatch({ a: 1, b: 2 }, { a: null, c: 3 })).toEqual({ b: 2, c: 3 });
  });
});

describe("query client helpers", () => {
  let qc: QueryClient;
  const plainKey = baseKeys.rows("base", {});
  const searchKey = baseKeys.rows("base", { search: "x" });
  const otherBaseKey = baseKeys.rows("other", {});

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(plainKey, data(page([row("a", "a0"), row("c", "a2")])));
    qc.setQueryData(searchKey, data(page([row("c", "a2")])));
    qc.setQueryData(otherBaseKey, data(page([row("c", "a2")])));
    qc.setQueryData(baseKeys.row("base", "c"), row("c", "a2"));
  });

  const listIds = (key: readonly unknown[]) => ids(qc.getQueryData<RowsData>(key)!);

  it("upserts across every list of the base only", () => {
    upsertRows(qc, "base", [row("b", "a1"), row("c", "a2", { v: 1 })]);
    expect(listIds(plainKey)).toEqual([["a", "b", "c"]]);
    expect(listIds(searchKey)).toEqual([["c"]]);
    expect(qc.getQueryData<RowsData>(searchKey)!.pages[0].items[0].cells).toEqual({ v: 1 });
    expect(qc.getQueryData<BaseRow>(baseKeys.row("base", "c"))!.cells).toEqual({ v: 1 });
    expect(qc.getQueryData<RowsData>(otherBaseKey)!.pages[0].items[0].cells).toEqual({});
  });

  it("patches cells, moves and removes rows everywhere", () => {
    patchRowCells(qc, "base", "c", { p: "x" });
    expect(getCachedRow(qc, "base", "c")!.cells).toEqual({ p: "x" });
    expect(qc.getQueryData<RowsData>(searchKey)!.pages[0].items[0].cells).toEqual({ p: "x" });

    moveRow(qc, "base", "c", "Z0");
    expect(listIds(plainKey)).toEqual([["c", "a"]]);
    expect(qc.getQueryData<BaseRow>(baseKeys.row("base", "c"))!.position).toBe("Z0");

    removeRows(qc, "base", ["c"]);
    expect(listIds(plainKey)).toEqual([["a"]]);
    expect(listIds(searchKey)).toEqual([[]]);
    expect(getCachedRow(qc, "base", "c")).toBeUndefined();
  });

  it("restores a snapshot", () => {
    const snap = snapshotRows(qc, "base");
    removeRows(qc, "base", ["a", "c"]);
    restoreRowsSnapshot(qc, snap);
    expect(listIds(plainKey)).toEqual([["a", "c"]]);
    expect(getCachedRow(qc, "base", "c")).toBeDefined();
  });
});
