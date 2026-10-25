import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  RowsChunk,
  BaseRealtimeEvent,
  Base,
  BaseProperty,
  BaseRow,
  BaseView,
} from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import {
  applyBaseEvent,
  BaseEventDeps,
  FormulaJobs,
  MAX_ROWS_FETCHED_ONE_BY_ONE,
  recomputingPropertyIds,
} from "./base-event-handler";
import { RowsData } from "./row-cache";

const row = (id: string, position: string, cells: Record<string, unknown> = {}): BaseRow => ({
  id,
  pageId: "b",
  workspaceId: "ws",
  cells,
  position,
  creatorId: null,
  lastUpdatedById: null,
  docPageId: null,
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
});

const prop = (id: string, name: string, position: string): BaseProperty => ({
  id,
  pageId: "b",
  workspaceId: "ws",
  name,
  type: "text",
  typeOptions: {},
  position,
  isPrimary: false,
  pendingType: null,
  pendingTypeOptions: null,
  pendingToken: null,
  schemaVersion: 1,
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
});

const view = (id: string, name: string): BaseView => ({
  id,
  pageId: "b",
  workspaceId: "ws",
  creatorId: null,
  name,
  type: "table",
  config: {},
  position: "a0",
  createdAt: "",
  updatedAt: "",
});

const page = (items: BaseRow[]): RowsChunk => ({
  items,
  meta: { limit: 100, hasNextPage: false, hasPrevPage: false, nextCursor: null, prevCursor: null },
  references: { users: {}, pages: {} },
});

describe("applyBaseEvent", () => {
  let qc: QueryClient;
  let deps: BaseEventDeps;
  const rowsKey = baseKeys.rows("b", {});
  const rowIds = () => qc.getQueryData<RowsData>(rowsKey)!.pages[0].items.map((r) => r.id);
  const info = () => qc.getQueryData<Base>(baseKeys.info("b"))!;

  const apply = (e: Partial<BaseRealtimeEvent> & { operation: string }) =>
    applyBaseEvent(qc, { pageId: "b", ...e } as BaseRealtimeEvent, deps);

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(rowsKey, { pages: [page([row("r1", "a0"), row("r2", "a1")])], pageParams: [undefined] });
    qc.setQueryData<Base>(baseKeys.info("b"), {
      id: "b",
      slugId: "s",
      pageId: "b",
      name: "Base",
      spaceId: "sp",
      workspaceId: "ws",
      creatorId: null,
      properties: [prop("p1", "Name", "a0")],
      views: [view("v1", "Table")],
      createdAt: "",
      updatedAt: "",
      baseSchemaVersion: 3,
    });
    deps = {
      isOwnRequest: (id) => id === "mine",
      fetchRow: vi.fn(async (_p: string, id: string) => row(id, "a0", { fresh: true })),
      refetchRows: vi.fn(),
    };
  });

  it("applies row events idempotently", () => {
    const created = { operation: "base:row:created", row: row("r3", "a2") } as const;
    apply(created);
    apply(created);
    expect(rowIds()).toEqual(["r1", "r2", "r3"]);

    apply({ operation: "base:row:updated", rowId: "r1", updatedCells: { p1: "x" } });
    apply({ operation: "base:row:updated", rowId: "r1", updatedCells: { p1: "x" } });
    expect(qc.getQueryData<RowsData>(rowsKey)!.pages[0].items[0].cells).toEqual({ p1: "x" });

    apply({ operation: "base:row:reordered", rowId: "r3", position: "Z0" });
    expect(rowIds()).toEqual(["r3", "r1", "r2"]);

    apply({ operation: "base:row:deleted", rowId: "r3" });
    apply({ operation: "base:row:deleted", rowId: "r3" });
    apply({ operation: "base:rows:deleted", rowIds: ["r1", "missing"] });
    expect(rowIds()).toEqual(["r2"]);
  });

  it("drops echoes of our own row writes", () => {
    apply({ operation: "base:row:created", row: row("r3", "a2"), requestId: "mine" });
    apply({ operation: "base:row:deleted", rowId: "r1", requestId: "mine" });
    expect(rowIds()).toEqual(["r1", "r2"]);
    apply({ operation: "base:row:deleted", rowId: "r1", requestId: "theirs" });
    expect(rowIds()).toEqual(["r2"]);
  });

  it("still applies our own schema events (one request can cause several)", () => {
    apply({ operation: "base:property:updated", property: prop("p2", "Total", "a1"), requestId: "mine" });
    expect(info().properties.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("refetches changed rows that are in view", async () => {
    await apply({ operation: "base:rows:updated", rowIds: ["r1", "nope"], propertyIds: ["f"] });
    expect(deps.fetchRow).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData<RowsData>(rowsKey)!.pages[0].items[0].cells).toEqual({ fresh: true });
    expect(deps.refetchRows).not.toHaveBeenCalled();
  });

  it("refetches whole lists when many rows changed", async () => {
    const many = Array.from({ length: MAX_ROWS_FETCHED_ONE_BY_ONE + 1 }, (_, i) =>
      row(`m${i}`, `b${String(i).padStart(3, "0")}`),
    );
    qc.setQueryData(rowsKey, { pages: [page(many)], pageParams: [undefined] });
    await apply({ operation: "base:rows:updated", rowIds: many.map((r) => r.id), propertyIds: [] });
    expect(deps.refetchRows).toHaveBeenCalledWith("b");
    expect(deps.fetchRow).not.toHaveBeenCalled();
  });

  it("removes a refetched row that no longer exists", async () => {
    deps.fetchRow = vi.fn(async () => {
      throw { response: { status: 404 } };
    });
    await apply({ operation: "base:rows:updated", rowIds: ["r1"], propertyIds: [] });
    expect(rowIds()).toEqual(["r2"]);
  });

  it("applies property and view events", () => {
    apply({ operation: "base:property:created", property: prop("p2", "B", "a1") });
    apply({ operation: "base:property:created", property: prop("p2", "B", "a1") });
    apply({ operation: "base:property:reordered", propertyId: "p2", position: "Z" });
    expect(info().properties.find((p) => p.id === "p2")!.position).toBe("Z");
    apply({ operation: "base:property:deleted", propertyId: "p1" });
    expect(info().properties.map((p) => p.id)).toEqual(["p2"]);

    apply({ operation: "base:view:created", view: view("v2", "Board") });
    apply({ operation: "base:view:updated", view: view("v2", "Kanban") });
    expect(info().views.map((v) => v.name)).toEqual(["Table", "Kanban"]);
    apply({ operation: "base:view:deleted", viewId: "v1" });
    expect(info().views.map((v) => v.id)).toEqual(["v2"]);
  });

  it("refetches everything when the schema version moves", () => {
    const spy = vi.spyOn(qc, "invalidateQueries");
    apply({ operation: "base:subscribed", schemaVersion: 3 });
    apply({ operation: "base:schema:bumped", schemaVersion: 3 });
    expect(spy).not.toHaveBeenCalled();
    apply({ operation: "base:schema:bumped", schemaVersion: 4 });
    expect(info().baseSchemaVersion).toBe(4);
    expect(spy).toHaveBeenCalledWith({ queryKey: baseKeys.info("b") });
    expect(spy).toHaveBeenCalledWith({ queryKey: baseKeys.rowsRoot("b") });
    spy.mockClear();
    apply({ operation: "base:subscribed", schemaVersion: 7 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("tracks formula recompute jobs", () => {
    apply({ operation: "base:formula:recompute:started", jobId: "j1", propertyIds: ["f1"] });
    apply({ operation: "base:formula:recompute:started", jobId: "j2", propertyIds: ["f2"] });
    const jobs = () => qc.getQueryData<FormulaJobs>(baseKeys.formulaJobs("b"));
    expect([...recomputingPropertyIds(jobs())]).toEqual(["f1", "f2"]);
    apply({
      operation: "base:formula:recompute:completed",
      jobId: "j1",
      propertyIds: ["f1"],
      processed: 1,
      errored: 0,
    });
    expect([...recomputingPropertyIds(jobs())]).toEqual(["f2"]);
  });

  it("ignores events of bases that are not cached", () => {
    expect(() =>
      applyBaseEvent(qc, { operation: "base:row:deleted", pageId: "other", rowId: "x" }, deps),
    ).not.toThrow();
  });
});
