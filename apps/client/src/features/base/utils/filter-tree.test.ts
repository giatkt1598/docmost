import { describe, expect, it } from "vitest";
import { BaseProperty, RowFilter } from "@/features/base/types/base.types";
import {
  addCondition,
  addGroup,
  countConditions,
  defaultFilterValue,
  emptyFilter,
  MAX_GROUP_DEPTH,
  newCondition,
  nodeAt,
  pruneFilter,
  removeNode,
  setGroupOp,
  updateCondition,
} from "./filter-tree";

const prop = (id: string, type: BaseProperty["type"], typeOptions: any = {}) =>
  ({ id, type, typeOptions }) as Pick<BaseProperty, "id" | "type" | "typeOptions">;

const props = [
  prop("t", "text"),
  prop("n", "number"),
  prop("d", "date"),
  prop("s", "select", { choices: [{ id: "c1", name: "A", color: "red" }] }),
  prop("c", "checkbox"),
];

describe("filter tree editing", () => {
  it("adds conditions and groups by path", () => {
    let f = emptyFilter();
    f = addCondition(f, [], newCondition(props[0]));
    f = addGroup(f, [], newCondition(props[1]));
    f = addCondition(f, [1], newCondition(props[2]));
    expect(countConditions(f)).toBe(3);
    expect(nodeAt(f, [1, 1])).toMatchObject({ propertyId: "d", op: "eq" });
    expect(nodeAt(f, [5])).toBeUndefined();
  });

  it("limits group depth", () => {
    let f = addGroup(emptyFilter(), [], newCondition(props[0]));
    f = addGroup(f, [0], newCondition(props[0]));
    expect(countConditions(f)).toBe(2);
    const deeper = addGroup(f, [0, 1], newCondition(props[0]));
    expect([0, 1].length).toBe(MAX_GROUP_DEPTH);
    expect(deeper).toBe(f);
  });

  it("removes nodes and groups left empty", () => {
    let f = addGroup(emptyFilter(), [], newCondition(props[0]));
    f = addCondition(f, [], newCondition(props[1]));
    f = removeNode(f, [0, 0]);
    expect(f.children).toHaveLength(1);
    expect(nodeAt(f, [0])).toMatchObject({ propertyId: "n" });
    expect(removeNode(f, [])).toEqual(emptyFilter());
  });

  it("switches and / or", () => {
    const f = setGroupOp(addCondition(emptyFilter(), [], newCondition(props[0])), [], "or");
    expect(f.op).toBe("or");
  });

  it("resets operator and value when the property changes", () => {
    let f = addCondition(emptyFilter(), [], { propertyId: "t", op: "contains", value: "x" });
    f = updateCondition(f, [0], { propertyId: "n" }, props);
    expect(nodeAt(f, [0])).toEqual({ propertyId: "n", op: "eq", value: "" });
  });

  it("resets the value only when the value kind changes", () => {
    let f = addCondition(emptyFilter(), [], { propertyId: "t", op: "contains", value: "x" });
    f = updateCondition(f, [0], { op: "startsWith" }, props);
    expect(nodeAt(f, [0])).toMatchObject({ value: "x" });
    f = updateCondition(f, [0], { op: "isEmpty" }, props);
    expect(nodeAt(f, [0])).toMatchObject({ op: "isEmpty", value: undefined });
    let s = addCondition(emptyFilter(), [], { propertyId: "s", op: "eq", value: "c1" });
    s = updateCondition(s, [0], { op: "any" }, props);
    expect(nodeAt(s, [0])).toMatchObject({ op: "any", value: [] });
  });

  it("picks default values by kind", () => {
    expect(defaultFilterValue(props[2], "before")).toEqual({ mode: "relative", preset: "today" });
    expect(defaultFilterValue(props[2], "isWithin")).toEqual({ mode: "range", preset: "thisWeek" });
    expect(defaultFilterValue(props[4], "eq")).toBe(true);
    expect(defaultFilterValue(props[0], "isNotEmpty")).toBeUndefined();
  });
});

describe("pruneFilter", () => {
  it("drops incomplete conditions, unknown properties and empty groups", () => {
    const f: RowFilter = {
      op: "and",
      children: [
        { propertyId: "t", op: "contains", value: "  " },
        { propertyId: "t", op: "isEmpty" },
        { propertyId: "gone", op: "eq", value: "x" },
        { propertyId: "n", op: "gt", value: "12" },
        { propertyId: "n", op: "contains", value: "1" },
        { op: "or", children: [{ propertyId: "s", op: "any", value: [] }] },
        { propertyId: "d", op: "eq", value: { mode: "exact", date: "nope" } },
        { propertyId: "d", op: "isWithin", value: { mode: "range", preset: "thisMonth" } },
        { propertyId: "c", op: "eq", value: false },
      ],
    };
    expect(pruneFilter(f, props)).toEqual({
      op: "and",
      children: [
        { propertyId: "t", op: "isEmpty" },
        { propertyId: "n", op: "gt", value: 12 },
        { propertyId: "d", op: "isWithin", value: { mode: "range", preset: "thisMonth" } },
        { propertyId: "c", op: "eq", value: false },
      ],
    });
  });

  it("returns undefined when nothing is left", () => {
    expect(pruneFilter(null, props)).toBeUndefined();
    expect(pruneFilter(emptyFilter(), props)).toBeUndefined();
    expect(
      pruneFilter({ op: "and", children: [{ propertyId: "t", op: "eq", value: "" }] }, props),
    ).toBeUndefined();
  });
});
