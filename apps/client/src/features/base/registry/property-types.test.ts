import { describe, expect, it } from "vitest";
import {
  PROPERTY_TYPE_IDS,
  PropertyType,
  FILTER_OPS,
  BaseProperty,
} from "@/features/base/types/base.types";
import {
  conversionTargets,
  getPropertyType,
  getPropertyTypeComponents,
  hasTypeOptions,
  isPropertyEditable,
  isPropertySortable,
  PROPERTY_TYPE_LIST,
  PROPERTY_TYPES,
  propertyFilterOperators,
  registerPropertyTypeComponents,
} from "./property-types";
import {
  filterOperatorsFor,
  filterValueKind,
  FILTER_OPERATOR_LABELS,
  isOperatorAllowed,
} from "./filter-operators";

const p = (type: PropertyType, typeOptions: any = {}) => ({ type, typeOptions });

describe("property type registry", () => {
  it("describes all 17 types", () => {
    expect(PROPERTY_TYPE_LIST.map((d) => d.type)).toEqual([...PROPERTY_TYPE_IDS]);
    expect(PROPERTY_TYPE_IDS).toHaveLength(17);
    for (const d of PROPERTY_TYPE_LIST) {
      expect(d.label).toBeTruthy();
      expect(d.icon).toBeTruthy();
    }
  });

  it("marks computed types read-only and out of cells", () => {
    for (const t of ["createdAt", "lastEditedAt", "lastEditedBy", "formula"] as const) {
      expect(PROPERTY_TYPES[t].editable).toBe(false);
      expect(PROPERTY_TYPES[t].convertibleTarget).toBe(false);
    }
    expect(PROPERTY_TYPES.formula.storedInCells).toBe(true);
    expect(PROPERTY_TYPES.createdAt.storedInCells).toBe(false);
    expect(PROPERTY_TYPES.text.editable).toBe(true);
  });

  it("knows which types have options", () => {
    expect(hasTypeOptions("select")).toBe(true);
    expect(hasTypeOptions("date")).toBe(true);
    expect(hasTypeOptions("createdAt")).toBe(true);
    expect(hasTypeOptions("lastEditedAt")).toBe(true);
    expect(hasTypeOptions("formula")).toBe(true);
    expect(hasTypeOptions("file")).toBe(false);
    expect(hasTypeOptions("lastEditedBy")).toBe(false);
  });

  it("knows which properties can be sorted", () => {
    expect(isPropertySortable(p("page"))).toBe(false);
    expect(isPropertySortable(p("text"))).toBe(true);
    expect(isPropertySortable(p("person"))).toBe(true);
    expect(isPropertySortable(p("person", { allowMultiple: true }))).toBe(false);
    expect(isPropertySortable(p("formula", { resultType: "number" }))).toBe(true);
  });

  it("blocks editing while a conversion runs", () => {
    expect(isPropertyEditable({ type: "text", pendingType: null })).toBe(true);
    expect(isPropertyEditable({ type: "text", pendingType: "number" })).toBe(false);
    expect(isPropertyEditable({ type: "formula", pendingType: null })).toBe(false);
  });

  it("falls back to text for unknown types", () => {
    expect(getPropertyType("bogus").type).toBe("text");
  });

  it("offers conversion targets, text only for the primary property", () => {
    const targets = (type: PropertyType, isPrimary = false) =>
      conversionTargets({ type, isPrimary } as Pick<BaseProperty, "type" | "isPrimary">).map(
        (d) => d.type,
      );
    expect(targets("text", true)).toEqual(["longText"]);
    const fromNumber = targets("number");
    expect(fromNumber).toContain("text");
    expect(fromNumber).not.toContain("number");
    expect(fromNumber).not.toContain("formula");
    expect(fromNumber).not.toContain("createdAt");
  });

  it("lets later phases attach components", () => {
    const Cell = () => null;
    const Editor = () => null;
    registerPropertyTypeComponents("text", { Cell });
    registerPropertyTypeComponents("text", { Editor });
    expect(getPropertyTypeComponents("text")).toEqual({ Cell, Editor });
    expect(getPropertyTypeComponents("number")).toEqual({});
    expect(getPropertyTypeComponents("bogus")).toEqual({});
  });
});

describe("filter operators", () => {
  it.each([
    ["text", ["contains", "ncontains", "eq", "neq", "startsWith", "endsWith", "isEmpty", "isNotEmpty"]],
    ["url", ["contains", "ncontains", "eq", "neq", "startsWith", "endsWith", "isEmpty", "isNotEmpty"]],
    ["number", ["eq", "neq", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"]],
    ["checkbox", ["eq", "neq"]],
    ["select", ["eq", "neq", "any", "none", "isEmpty", "isNotEmpty"]],
    ["status", ["eq", "neq", "any", "none", "isEmpty", "isNotEmpty"]],
    ["multiSelect", ["any", "all", "none", "isEmpty", "isNotEmpty"]],
    ["date", ["eq", "neq", "before", "after", "onOrBefore", "onOrAfter", "isWithin", "isEmpty", "isNotEmpty"]],
    ["createdAt", ["eq", "neq", "before", "after", "onOrBefore", "onOrAfter", "isWithin"]],
    ["lastEditedAt", ["eq", "neq", "before", "after", "onOrBefore", "onOrAfter", "isWithin"]],
    ["file", ["isEmpty", "isNotEmpty"]],
    ["page", ["eq", "neq", "isEmpty", "isNotEmpty"]],
    ["lastEditedBy", ["any", "none"]],
  ] as const)("%s", (type, expected) => {
    expect(filterOperatorsFor(p(type))).toEqual(expected);
    expect(propertyFilterOperators(p(type))).toEqual(expected);
  });

  it("depends on options for person and formula", () => {
    expect(filterOperatorsFor(p("person"))).toEqual(["any", "none", "isEmpty", "isNotEmpty"]);
    expect(filterOperatorsFor(p("person", { allowMultiple: true }))).toEqual([
      "any",
      "all",
      "none",
      "isEmpty",
      "isNotEmpty",
    ]);
    expect(filterOperatorsFor(p("formula", { resultType: "number" }))).toContain("gt");
    expect(filterOperatorsFor(p("formula", { resultType: "boolean" }))).toEqual(["eq", "neq"]);
    expect(filterOperatorsFor(p("formula", { resultType: "date" }))).toContain("isWithin");
    expect(filterOperatorsFor(p("formula", { resultType: "text" }))).toContain("contains");
    expect(filterOperatorsFor(p("formula"))).toContain("contains");
  });

  it("only uses operators the server knows, each with a label", () => {
    for (const type of PROPERTY_TYPE_IDS) {
      for (const op of filterOperatorsFor(p(type))) {
        expect(FILTER_OPS).toContain(op);
      }
    }
    expect(Object.keys(FILTER_OPERATOR_LABELS).sort()).toEqual([...FILTER_OPS].sort());
  });

  it("tells the value input to show", () => {
    expect(filterValueKind(p("text"), "isEmpty")).toBe("none");
    expect(filterValueKind(p("text"), "contains")).toBe("text");
    expect(filterValueKind(p("number"), "gt")).toBe("number");
    expect(filterValueKind(p("checkbox"), "eq")).toBe("boolean");
    expect(filterValueKind(p("date"), "before")).toBe("date");
    expect(filterValueKind(p("createdAt"), "isWithin")).toBe("dateRange");
    expect(filterValueKind(p("select"), "eq")).toBe("choice");
    expect(filterValueKind(p("select"), "any")).toBe("choices");
    expect(filterValueKind(p("multiSelect"), "all")).toBe("choices");
    expect(filterValueKind(p("person"), "any")).toBe("users");
    expect(filterValueKind(p("lastEditedBy"), "none")).toBe("users");
    expect(filterValueKind(p("page"), "eq")).toBe("page");
    expect(filterValueKind(p("formula", { resultType: "number" }), "lt")).toBe("number");
    expect(filterValueKind(p("formula", { resultType: "boolean" }), "eq")).toBe("boolean");
  });

  it("checks operators", () => {
    expect(isOperatorAllowed(p("number"), "gt")).toBe(true);
    expect(isOperatorAllowed(p("text"), "gt")).toBe(false);
  });
});
