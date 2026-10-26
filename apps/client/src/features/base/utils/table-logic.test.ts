import { describe, expect, it } from "vitest";
import { BaseProperty } from "@/features/base/types/base.types";
import {
  buildColumns,
  clampWidth,
  DEFAULT_COLUMN_WIDTH,
  gridWidth,
  GUTTER_WIDTH,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  orderProperties,
  pinnedEdge,
  PRIMARY_COLUMN_WIDTH,
  reorderColumns,
  toggleHidden,
  withWidth,
  ADD_COLUMN_WIDTH,
} from "./grid-columns";
import { afterCommit, clampPos, gridKeyAction, isPrintableKey } from "./grid-navigation";
import {
  clickRow,
  emptySelection,
  pruneSelection,
  selectAll,
  selectAllState,
} from "./row-selection";
import { addSortRule, moveSortRule, pruneSorts } from "./sort-rules";

const p = (id: string, position: string, extra: Partial<BaseProperty> = {}) =>
  ({ id, name: id, type: "text", typeOptions: {}, position, isPrimary: false, ...extra }) as BaseProperty;

const props = [p("c", "a3"), p("title", "a0", { isPrimary: true }), p("a", "a1"), p("b", "a2")];

describe("grid columns", () => {
  it("orders primary first, then propertyOrder, then by position", () => {
    expect(orderProperties(props, undefined).map((x) => x.id)).toEqual(["title", "a", "b", "c"]);
    expect(orderProperties(props, ["c", "a", "ghost"]).map((x) => x.id)).toEqual([
      "title",
      "c",
      "a",
      "b",
    ]);
  });

  it("merges saved widths, overrides and hidden columns", () => {
    const cols = buildColumns(
      props,
      { hiddenPropertyIds: ["b", "title"], propertyWidths: { a: 50, c: 300 } },
      { c: 420 },
    );
    expect(cols.map((c) => [c.property.id, c.width, c.left, c.pinned])).toEqual([
      ["title", PRIMARY_COLUMN_WIDTH, GUTTER_WIDTH, true],
      ["a", MIN_COLUMN_WIDTH, GUTTER_WIDTH + PRIMARY_COLUMN_WIDTH, false],
      ["c", 420, GUTTER_WIDTH + PRIMARY_COLUMN_WIDTH + MIN_COLUMN_WIDTH, false],
    ]);
    expect(gridWidth(cols, true)).toBe(GUTTER_WIDTH + PRIMARY_COLUMN_WIDTH + MIN_COLUMN_WIDTH + 420 + ADD_COLUMN_WIDTH);
    expect(gridWidth(cols, false)).toBe(GUTTER_WIDTH + PRIMARY_COLUMN_WIDTH + MIN_COLUMN_WIDTH + 420);
  });

  it("clamps widths", () => {
    expect(clampWidth(10)).toBe(MIN_COLUMN_WIDTH);
    expect(clampWidth(5000)).toBe(MAX_COLUMN_WIDTH);
    expect(clampWidth(NaN)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(withWidth({ a: 100 }, "b", 222.4)).toEqual({ a: 100, b: 222 });
  });

  it("reorders columns by drop edge, keeping hidden ones in the order", () => {
    expect(reorderColumns(props, undefined, "c", "a", "left")).toEqual(["c", "a", "b"]);
    expect(reorderColumns(props, undefined, "a", "c", "right")).toEqual(["b", "c", "a"]);
    expect(reorderColumns(props, undefined, "title", "a", "left")).toEqual(["a", "b", "c"]);
    expect(reorderColumns(props, ["b", "a", "c"], "c", "b", "left")).toEqual(["c", "b", "a"]);
  });

  it("toggles hidden ids", () => {
    expect(toggleHidden(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleHidden(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleHidden(undefined, "a", false)).toEqual([]);
  });
});

describe("frozen column edges", () => {
  // primary column right after the gutter: x = 64..324
  const col = { left: GUTTER_WIDTH, width: PRIMARY_COLUMN_WIDTH };

  it("is free while it is fully visible", () => {
    expect(pinnedEdge(col, 0, 1000)).toBeNull();
    expect(pinnedEdge(col, 0, GUTTER_WIDTH + PRIMARY_COLUMN_WIDTH)).toBeNull();
  });

  it("sticks left once scrolling would push it past the gutter", () => {
    expect(pinnedEdge(col, 1, 1000)).toBe("left");
    expect(pinnedEdge(col, 400, 1000)).toBe("left");
  });

  it("sticks right when it would be beyond the right edge", () => {
    expect(pinnedEdge(col, 0, 200)).toBe("right");
    // a column that is not next to the gutter
    expect(pinnedEdge({ left: 800, width: 260 }, 0, 600)).toBe("right");
    expect(pinnedEdge({ left: 800, width: 260 }, 500, 600)).toBeNull();
    expect(pinnedEdge({ left: 800, width: 260 }, 900, 600)).toBe("left");
  });

  it("lays columns out by flow: the natural offset follows the widths", () => {
    const cols = buildColumns(props, {});
    const frozen = cols.find((c) => c.pinned)!;
    expect(frozen.left).toBe(GUTTER_WIDTH);
    expect(cols.filter((c) => c.pinned)).toHaveLength(1);
  });
});

describe("grid keyboard model", () => {
  const b = { rows: 3, cols: 4 };
  const at = (row: number, col: number) => ({ row, col });

  it.each([
    ["ArrowDown", {}, at(1, 1), at(2, 1)],
    ["ArrowDown", {}, at(2, 1), at(2, 1)],
    ["ArrowUp", {}, at(0, 1), at(0, 1)],
    ["ArrowRight", {}, at(1, 3), at(1, 3)],
    ["ArrowLeft", {}, at(1, 2), at(1, 1)],
    ["ArrowDown", { ctrlKey: true }, at(0, 1), at(2, 1)],
    ["ArrowRight", { metaKey: true }, at(0, 0), at(0, 3)],
    ["Home", {}, at(1, 2), at(1, 0)],
    ["End", { ctrlKey: true }, at(0, 0), at(2, 3)],
    ["Tab", {}, at(0, 3), at(1, 0)],
    ["Tab", { shiftKey: true }, at(1, 0), at(0, 3)],
    ["Tab", {}, at(2, 3), at(2, 3)],
  ])("%s %j from %j", (key, mods, from, to) => {
    expect(gridKeyAction(from, { key, ...mods }, b)).toEqual({ kind: "move", to });
  });

  it("maps editing keys", () => {
    expect(gridKeyAction(at(0, 0), { key: "Enter" }, b)).toEqual({ kind: "edit" });
    expect(gridKeyAction(at(0, 0), { key: "F2" }, b)).toEqual({ kind: "edit" });
    expect(gridKeyAction(at(0, 0), { key: "x" }, b)).toEqual({ kind: "edit", initialInput: "x" });
    expect(gridKeyAction(at(0, 0), { key: "x", ctrlKey: true }, b)).toEqual({ kind: "none" });
    expect(gridKeyAction(at(0, 0), { key: "Delete" }, b)).toEqual({ kind: "clear" });
    expect(gridKeyAction(at(0, 0), { key: "Backspace" }, b)).toEqual({ kind: "clear" });
    expect(gridKeyAction(at(0, 0), { key: "Escape" }, b)).toEqual({ kind: "escape" });
    expect(gridKeyAction(at(0, 0), { key: "Shift" }, b)).toEqual({ kind: "none" });
    expect(gridKeyAction(at(0, 0), { key: "ArrowDown" }, { rows: 0, cols: 2 })).toEqual({ kind: "none" });
  });

  it("moves after a commit", () => {
    expect(afterCommit(at(0, 1), "Enter", b)).toEqual(at(1, 1));
    expect(afterCommit(at(2, 1), "Enter", b)).toEqual(at(2, 1));
    expect(afterCommit(at(0, 3), "Tab", b)).toEqual(at(1, 0));
    expect(afterCommit(at(1, 0), "ShiftTab", b)).toEqual(at(0, 3));
  });

  it("clamps positions and detects printable keys", () => {
    expect(clampPos(at(9, 9), b)).toEqual(at(2, 3));
    expect(clampPos(at(0, 0), { rows: 0, cols: 1 })).toBeNull();
    expect(isPrintableKey({ key: "é" })).toBe(true);
    expect(isPrintableKey({ key: "Enter" })).toBe(false);
  });
});

describe("row selection", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("toggles and selects ranges from the anchor", () => {
    let s = clickRow(emptySelection(), "b", order, false);
    s = clickRow(s, "d", order, true);
    expect([...s.ids].sort()).toEqual(["b", "c", "d"]);
    // extends from the same anchor
    s = clickRow(s, "a", order, true);
    expect([...s.ids].sort()).toEqual(["a", "b", "c", "d"]);
    s = clickRow(s, "c", order, false);
    expect(s.ids.has("c")).toBe(false);
    expect(s.anchor).toBe("c");
  });

  it("falls back to a toggle without an anchor", () => {
    const s = clickRow(emptySelection(), "c", order, true);
    expect([...s.ids]).toEqual(["c"]);
  });

  it("reports the select-all state and prunes missing rows", () => {
    expect(selectAllState(emptySelection(), order)).toBe("none");
    expect(selectAllState(selectAll(order), order)).toBe("all");
    const some = clickRow(emptySelection(), "a", order, false);
    expect(selectAllState(some, order)).toBe("some");
    const pruned = pruneSelection(selectAll(order), ["a", "c"]);
    expect([...pruned.ids]).toEqual(["a", "c"]);
    expect(pruneSelection(pruned, ["a", "c"])).toBe(pruned);
  });
});

describe("sort rules", () => {
  const sp = [
    { id: "t", type: "text", typeOptions: {} },
    { id: "pg", type: "page", typeOptions: {} },
    { id: "n", type: "number", typeOptions: {} },
  ] as any[];

  it("adds, moves and prunes rules", () => {
    let rules = addSortRule([], "t");
    rules = addSortRule(rules, "n");
    rules = addSortRule(rules, "n");
    expect(rules).toEqual([
      { propertyId: "t", direction: "asc" },
      { propertyId: "n", direction: "asc" },
    ]);
    expect(moveSortRule(rules, 1, -1).map((r) => r.propertyId)).toEqual(["n", "t"]);
    expect(moveSortRule(rules, 0, -1)).toBe(rules);
    expect(
      pruneSorts(
        [
          { propertyId: "pg", direction: "asc" },
          { propertyId: "gone", direction: "asc" },
          { propertyId: "n", direction: "desc" },
          { propertyId: "n", direction: "asc" },
        ],
        sp,
      ),
    ).toEqual([{ propertyId: "n", direction: "desc" }]);
    expect(pruneSorts([], sp)).toBeUndefined();
  });
});
