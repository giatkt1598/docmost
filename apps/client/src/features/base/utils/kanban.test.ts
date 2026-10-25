import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { BaseProperty, BaseRow, NO_VALUE_COLUMN, RowsChunk } from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import {
  boardColumns,
  cardDropPosition,
  cardProperties,
  cellsForColumn,
  columnIdOfRow,
  columnOf,
  defaultGroupProperty,
  moveColumn,
  resolveGroupProperty,
  seedStatusOptions,
  setColumnHidden,
} from "./kanban";
import { columnCondition, normalizeRowQuery, toRequestQuery, withColumnFilter } from "./rows-params";
import {
  belongsToColumn,
  moveRow,
  patchRowCells,
  RowsData,
  upsertRows,
  upsertRowsInData,
} from "./row-cache";
import { comparePositions } from "./position";
import { uniquePropertyName } from "./property-names";

const status = {
  id: "st",
  name: "Status",
  type: "status",
  isPrimary: false,
  pendingType: null,
  position: "a1",
  typeOptions: {
    choices: [
      { id: "todo", name: "Todo", color: "gray" },
      { id: "doing", name: "Doing", color: "blue" },
      { id: "done", name: "Done", color: "green" },
    ],
    choiceOrder: ["todo", "doing", "done"],
  },
} as unknown as BaseProperty;

const props = [
  { id: "title", name: "Title", type: "text", isPrimary: true, position: "a0", typeOptions: {} },
  { id: "sel", name: "Kind", type: "select", isPrimary: false, position: "a2", typeOptions: { choices: [], choiceOrder: [] } },
  status,
  { id: "n", name: "Points", type: "number", isPrimary: false, position: "a3", typeOptions: {} },
] as unknown as BaseProperty[];

const row = (id: string, position: string, cells: Record<string, unknown> = {}) =>
  ({ id, position, cells, pageId: "b" }) as unknown as BaseRow;

describe("board columns", () => {
  it("uses the property order with No value first by default", () => {
    expect(boardColumns(status, {}).map((c) => c.id)).toEqual([NO_VALUE_COLUMN, "todo", "doing", "done"]);
  });

  it("follows the view choiceOrder, appending unknown choices", () => {
    const cols = boardColumns(status, {
      choiceOrder: ["done", NO_VALUE_COLUMN, "ghost", "todo"],
      hiddenChoiceIds: ["todo"],
    });
    expect(cols.map((c) => [c.id, c.hidden])).toEqual([
      ["done", false],
      [NO_VALUE_COLUMN, false],
      ["todo", true],
      ["doing", false],
    ]);
    expect(cols[1].choice).toBeNull();
    expect(cols[0].choice?.name).toBe("Done");
  });

  it("moves and hides columns", () => {
    const cols = boardColumns(status, {});
    expect(moveColumn(cols, "done", "todo", "left")).toEqual([NO_VALUE_COLUMN, "done", "todo", "doing"]);
    expect(moveColumn(cols, NO_VALUE_COLUMN, "done", "right")).toEqual(["todo", "doing", "done", NO_VALUE_COLUMN]);
    expect(moveColumn(cols, "x", "done", "right")).toEqual(cols.map((c) => c.id));
    expect(setColumnHidden(["a"], "b", true)).toEqual(["a", "b"]);
    expect(setColumnHidden(["a", "b"], "a", false)).toEqual(["b"]);
  });

  it("finds the group property", () => {
    expect(defaultGroupProperty(props)?.id).toBe("st");
    expect(defaultGroupProperty(props.filter((p) => p.id !== "st"))?.id).toBe("sel");
    expect(defaultGroupProperty([props[0]])).toBeNull();
    expect(resolveGroupProperty(props, { groupByPropertyId: "st" })?.id).toBe("st");
    expect(resolveGroupProperty(props, { groupByPropertyId: "n" })).toBeNull();
    const converting = [{ ...status, pendingType: "text" }] as BaseProperty[];
    expect(resolveGroupProperty(converting, { groupByPropertyId: "st" })).toBeNull();
  });

  it("maps rows and columns to cells", () => {
    expect(cellsForColumn("st", "doing")).toEqual({ st: "doing" });
    expect(cellsForColumn("st", NO_VALUE_COLUMN)).toEqual({ st: null });
    expect(columnIdOfRow(row("r", "a0", { st: "done" }), status)).toBe("done");
    expect(columnIdOfRow(row("r", "a0", { st: "deleted" }), status)).toBe(NO_VALUE_COLUMN);
    expect(columnIdOfRow(row("r", "a0"), status)).toBe(NO_VALUE_COLUMN);
    expect(columnOf("st", NO_VALUE_COLUMN)).toEqual({ propertyId: "st", value: null });
  });

  it("lists card properties in view order without the primary", () => {
    expect(cardProperties(props, ["n", "title", "st"]).map((p) => p.id)).toEqual(["st", "n"]);
    expect(cardProperties(props, undefined)).toEqual([]);
  });

  it("seeds a status property and unique names", () => {
    const opts = seedStatusOptions({ todo: "Not started", inProgress: "In progress", done: "Done" });
    expect(opts.choices.map((c) => [c.name, c.category, c.color])).toEqual([
      ["Not started", "todo", "gray"],
      ["In progress", "inProgress", "blue"],
      ["Done", "complete", "green"],
    ]);
    expect(opts.choiceOrder).toEqual(opts.choices.map((c) => c.id));
    expect(uniquePropertyName("Status", ["status", "Status 2"])).toBe("Status 3");
    expect(uniquePropertyName("Status", ["Title"])).toBe("Status");
  });
});

describe("card drop positions", () => {
  const cards = [row("a", "a0"), row("b", "a1"), row("c", "a2")];

  it("places a card between its neighbours", () => {
    const top = cardDropPosition(cards, "x", "b", "top");
    expect(comparePositions("a0", top)).toBe(-1);
    expect(comparePositions(top, "a1")).toBe(-1);
    const bottom = cardDropPosition(cards, "x", "b", "bottom");
    expect(comparePositions("a1", bottom)).toBe(-1);
    expect(comparePositions(bottom, "a2")).toBe(-1);
  });

  it("ignores the moved card itself and handles the ends", () => {
    const p = cardDropPosition(cards, "b", "c", "top");
    expect(comparePositions("a0", p)).toBe(-1);
    expect(comparePositions(p, "a2")).toBe(-1);
    expect(comparePositions("a2", cardDropPosition(cards, "x", null, "bottom"))).toBe(-1);
    expect(comparePositions(cardDropPosition(cards, "x", "a", "top"), "a0")).toBe(-1);
    expect(cardDropPosition([], "x", null, "bottom")).toBeTruthy();
  });
});

describe("column queries", () => {
  const filter = { op: "or" as const, children: [{ propertyId: "n", op: "gt" as const, value: 1 }] };

  it("adds the group condition to the view filter", () => {
    expect(columnCondition({ propertyId: "st", value: "doing" })).toEqual({
      propertyId: "st",
      op: "any",
      value: ["doing"],
    });
    expect(columnCondition({ propertyId: "st", value: null })).toEqual({ propertyId: "st", op: "isEmpty" });
    expect(withColumnFilter(undefined, { propertyId: "st", value: "x" })).toEqual({
      op: "and",
      children: [{ propertyId: "st", op: "any", value: ["x"] }],
    });
    expect(withColumnFilter(filter, { propertyId: "st", value: null })).toEqual({
      op: "and",
      children: [filter, { propertyId: "st", op: "isEmpty" }],
    });
    expect(withColumnFilter(filter, undefined)).toBe(filter);
  });

  it("keeps the column in the cache key and sends it as a filter", () => {
    const q = { search: " q ", column: { propertyId: "st", value: "doing" } };
    expect(normalizeRowQuery(q)).toEqual({ search: "q", column: { propertyId: "st", value: "doing" } });
    expect(toRequestQuery(q)).toEqual({
      search: "q",
      filter: { op: "and", children: [{ propertyId: "st", op: "any", value: ["doing"] }] },
    });
    expect(toRequestQuery({ sorts: [] })).toEqual({});
  });
});

describe("column lists in the row cache", () => {
  const chunk = (items: BaseRow[]): RowsChunk => ({
    items,
    meta: { limit: 100, hasNextPage: false, hasPrevPage: false, nextCursor: null, prevCursor: null },
    references: { users: {}, pages: {} },
  });
  const data = (...items: BaseRow[]): RowsData => ({ pages: [chunk(items)], pageParams: [undefined] });
  const todoKey = baseKeys.rows("b", { column: { propertyId: "st", value: "todo" } });
  const doneKey = baseKeys.rows("b", { column: { propertyId: "st", value: "done" } });
  const noneKey = baseKeys.rows("b", { column: { propertyId: "st", value: null } });
  const tableKey = baseKeys.rows("b", {});
  let qc: QueryClient;
  const ids = (key: readonly unknown[]) =>
    qc.getQueryData<RowsData>(key)!.pages.flatMap((p) => p.items.map((r) => r.id));

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(todoKey, data(row("a", "a0", { st: "todo" }), row("b", "a2", { st: "todo" })));
    qc.setQueryData(doneKey, data(row("c", "a1", { st: "done" })));
    qc.setQueryData(noneKey, data());
    qc.setQueryData(tableKey, data(row("a", "a0", { st: "todo" }), row("c", "a1", { st: "done" }), row("b", "a2", { st: "todo" })));
  });

  it("knows column membership", () => {
    expect(belongsToColumn({ column: { propertyId: "st", value: "todo" } }, row("x", "a", { st: "todo" }))).toBe(true);
    expect(belongsToColumn({ column: { propertyId: "st", value: null } }, row("x", "a", { st: "" }))).toBe(true);
    expect(belongsToColumn({}, row("x", "a"))).toBeUndefined();
  });

  it("moves a card across columns when its group cell changes", () => {
    patchRowCells(qc, "b", "a", { st: "done" });
    expect(ids(todoKey)).toEqual(["b"]);
    expect(ids(doneKey)).toEqual(["a", "c"]);
    expect(ids(tableKey)).toEqual(["a", "c", "b"]);
    // then the new position puts it after c
    moveRow(qc, "b", "a", "a15");
    expect(ids(doneKey)).toEqual(["c", "a"]);
    patchRowCells(qc, "b", "a", { st: null });
    expect(ids(doneKey)).toEqual(["c"]);
    expect(ids(noneKey)).toEqual(["a"]);
  });

  it("puts new rows from events into their column only, once", () => {
    const fresh = row("d", "a3", { st: "done" });
    upsertRows(qc, "b", [fresh]);
    upsertRows(qc, "b", [fresh]);
    expect(ids(doneKey)).toEqual(["c", "d"]);
    expect(ids(todoKey)).toEqual(["a", "b"]);
    expect(ids(tableKey)).toEqual(["a", "c", "b", "d"]);
  });

  it("removes a listed row that no longer belongs", () => {
    const d = qc.getQueryData<RowsData>(todoKey)!;
    const out = upsertRowsInData(d, [row("a", "a0", { st: "doing" })], {
      column: { propertyId: "st", value: "todo" },
    });
    expect(out.pages[0].items.map((r) => r.id)).toEqual(["b"]);
  });
});
