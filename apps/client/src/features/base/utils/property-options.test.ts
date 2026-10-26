import { describe, expect, it } from "vitest";
import { BaseProperty, ChoiceOptions } from "@/features/base/types/base.types";
import {
  addChoice,
  choiceListIssues,
  moveChoice,
  normalizeChoiceOptions,
  removeChoice,
  updateChoice,
} from "./choice-edits";
import {
  cleanDateOptions,
  dateFormatIssue,
  datePreview,
  numberPreview,
} from "./options-preview";
import {
  filterFunctions,
  FORMULA_FUNCTIONS,
  insertFunction,
  insertProperty,
  insertText,
  propReference,
} from "./formula-catalog";
import {
  conversionOptions,
  optionsToSave,
  orderWithInserted,
  rowNeighbours,
} from "./property-edits";

const opts = (): ChoiceOptions => ({
  choices: [
    { id: "a", name: "A", color: "red" },
    { id: "b", name: "B", color: "blue" },
    { id: "c", name: "C", color: "green" },
  ],
  choiceOrder: ["c", "a", "b"],
  defaultValue: "a",
});

describe("choice list edits", () => {
  it("normalizes choices into choiceOrder", () => {
    expect(normalizeChoiceOptions(opts()).choices.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(normalizeChoiceOptions(null)).toEqual({ choices: [], choiceOrder: [] });
  });

  it("adds options with a free colour and a status category", () => {
    const out = addChoice(opts(), "  New ", true);
    const added = out.choices[3];
    expect(added).toMatchObject({ name: "New", category: "todo" });
    expect(added.color).not.toMatch(/^(red|blue|green)$/);
    expect(out.choiceOrder).toEqual(["c", "a", "b", added.id]);
    expect(addChoice(opts(), "X", false).choices[3].category).toBeUndefined();
  });

  it("renames, recolours and sets categories", () => {
    const out = updateChoice(opts(), "b", { name: "Bee", color: "teal", category: "complete" });
    expect(out.choices.find((c) => c.id === "b")).toMatchObject({ name: "Bee", color: "teal", category: "complete" });
  });

  it("moves options and keeps choiceOrder in sync", () => {
    const out = moveChoice(opts(), 0, 2);
    expect(out.choiceOrder).toEqual(["a", "b", "c"]);
    expect(out.choices.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(moveChoice(opts(), 0, 9).choiceOrder).toEqual(["c", "a", "b"]);
  });

  it("removes options and their default", () => {
    const out = removeChoice(opts(), "a");
    expect(out.choiceOrder).toEqual(["c", "b"]);
    expect(out.defaultValue).toBeNull();
    const multi = removeChoice({ ...opts(), defaultValue: ["a", "b"] }, "a");
    expect(multi.defaultValue).toEqual(["b"]);
  });

  it("finds blocking issues", () => {
    expect(choiceListIssues(opts())).toBeNull();
    expect(choiceListIssues(updateChoice(opts(), "a", { name: " " }))).toBe("empty-name");
    expect(choiceListIssues(updateChoice(opts(), "a", { name: "b " }))).toBe("duplicate-name");
  });
});

describe("option previews", () => {
  it("previews number formats", () => {
    expect(numberPreview({}, "en-US")).toBe("1,234.5678");
    expect(numberPreview({ format: "currency", currencySymbol: "€" }, "en-US")).toBe("€1,234.57");
    expect(numberPreview({ precision: 1, separators: "period_comma" }, "en-US")).toBe("1.234,6");
    expect(numberPreview({ format: "percent" }, "en-US")).toBe("42%");
    expect(numberPreview({ format: "progress" }, "en-US")).toBe("42%");
  });

  it("previews date formats with the formatter", () => {
    const now = new Date(2026, 9, 5, 14, 7);
    expect(datePreview({ dateFormat: "DD/MM/YYYY" }, "en-US", now)).toBe("05/10/2026");
    expect(datePreview({}, "en-US", now)).toBe("Oct 5, 2026");
    expect(datePreview({ includeTime: true, timeFormat: "12h" }, "en-US", now)).toBe("Oct 5, 2026 2:07 PM");
    expect(datePreview({ dateFormat: "relative" }, "en-US", now)).toBe("3 days ago");
    expect(datePreview({ dateFormat: "[Week] dddd" }, "en-US", now)).toBe("Week Monday");
  });

  it("validates and cleans date options", () => {
    expect(dateFormatIssue("x".repeat(64))).toBeNull();
    expect(dateFormatIssue("x".repeat(65))).toBe("too-long");
    expect(dateFormatIssue(undefined)).toBeNull();
    expect(cleanDateOptions({ dateFormat: " ", includeTime: false, timeFormat: "12h" })).toEqual({
      includeTime: false,
    });
    expect(optionsToSave("createdAt", { dateFormat: "YYYY", includeTime: true, timeFormat: "24h" })).toEqual({
      dateFormat: "YYYY",
      includeTime: true,
      timeFormat: "24h",
    });
  });

  it("normalises the stored date format when the editor opens or saves", () => {
    expect(cleanDateOptions({ dateFormat: "Relative (3 days ago)" })).toEqual({ dateFormat: "relative" });
    expect(cleanDateOptions({ dateFormat: " Relative " })).toEqual({ dateFormat: "relative" });
    expect(optionsToSave("date", { dateFormat: "Relative (3 days ago)", includeTime: true, timeFormat: "24h" })).toEqual({
      dateFormat: "relative",
      includeTime: true,
      timeFormat: "24h",
    });
    const now = new Date(2026, 9, 5, 14, 7);
    expect(datePreview({ dateFormat: "Relative (3 days ago)" }, "en-US", now)).toBe("3 days ago");
    expect(datePreview({ dateFormat: "relative" }, "en-US", now)).toBe("3 days ago");
  });

  it("sends only source and format options for formulas", () => {
    expect(
      optionsToSave("formula", { source: "1+1", resultType: "number", dependencies: [], ast: {} }),
    ).toEqual({ source: "1+1" });
    expect(
      optionsToSave("formula", { source: "1", resultType: "number", dependencies: [], formatOptions: { precision: 2 } }),
    ).toEqual({ source: "1", formatOptions: { precision: 2 } });
  });
});

describe("formula editor helpers", () => {
  it("quotes property names like the tokenizer", () => {
    expect(propReference("Price")).toBe('prop("Price")');
    expect(propReference('Say "hi"')).toBe('prop("Say \\"hi\\"")');
    expect(propReference("a\\b")).toBe('prop("a\\\\b")');
  });

  it("inserts at the caret or over the selection", () => {
    expect(insertText("ab", 1, 1, "X")).toEqual({ value: "aXb", caret: 2 });
    expect(insertText("abcd", 1, 3, "X")).toEqual({ value: "aXd", caret: 2 });
    expect(insertText("ab", 9, 9, "X")).toEqual({ value: "abX", caret: 3 });
    expect(insertFunction("1 + ", 4, 4, "round")).toEqual({ value: "1 + round()", caret: 10 });
    expect(insertProperty("", 0, 0, "Qty")).toEqual({ value: 'prop("Qty")', caret: 11 });
  });

  it("lists and filters functions", () => {
    expect(FORMULA_FUNCTIONS).toHaveLength(30);
    expect(new Set(FORMULA_FUNCTIONS.map((f) => f.name.toLowerCase())).size).toBe(30);
    expect(filterFunctions("date").map((f) => f.name)).toEqual(
      expect.arrayContaining(["dateAdd", "dateBetween", "formatDate"]),
    );
    expect(filterFunctions("  ")).toBe(FORMULA_FUNCTIONS);
  });
});

describe("property edits", () => {
  const prop = (id: string, extra: Partial<BaseProperty> = {}) =>
    ({ id, name: id, type: "text", typeOptions: {}, position: "a" + id, isPrimary: false, ...extra }) as BaseProperty;

  it("builds choices for a conversion", () => {
    const text = prop("t");
    const rows = [{ cells: { t: "Red" } }, { cells: { t: " red " } }, { cells: { t: "Blue, Green" } }, { cells: {} }];
    const sel = conversionOptions(text, "select", rows) as ChoiceOptions;
    expect(sel.choices.map((c) => c.name)).toEqual(["Red", "Blue, Green"]);
    expect(sel.choiceOrder).toEqual(sel.choices.map((c) => c.id));
    const multi = conversionOptions(text, "multiSelect", rows) as ChoiceOptions;
    expect(multi.choices.map((c) => c.name)).toEqual(["Red", "Blue", "Green"]);
    const status = conversionOptions(text, "status", rows) as ChoiceOptions;
    expect(status.choices.every((c) => c.category === "todo")).toBe(true);
  });

  it("copies choices between choice types", () => {
    const from = prop("s", { type: "status", typeOptions: { choices: [{ id: "x", name: "X", color: "red", category: "complete" }], choiceOrder: ["x"] } });
    expect(conversionOptions(from, "select", [])).toEqual({
      choices: [{ id: "x", name: "X", color: "red" }],
      choiceOrder: ["x"],
    });
    const sel = prop("s", { type: "select", typeOptions: { choices: [{ id: "x", name: "X", color: "red" }], choiceOrder: ["x"] } });
    expect((conversionOptions(sel, "status", []) as ChoiceOptions).choices[0].category).toBe("todo");
    expect(conversionOptions(prop("n"), "number", [])).toEqual({ format: "plain" });
  });

  it("places an inserted property", () => {
    const props = [prop("p", { isPrimary: true }), prop("a"), prop("b"), prop("new")];
    expect(orderWithInserted(props, undefined, "a", "right", "new")).toEqual(["a", "new", "b"]);
    expect(orderWithInserted(props, ["b", "a"], "a", "left", "new")).toEqual(["b", "new", "a"]);
    expect(orderWithInserted(props, undefined, "p", "right", "new")).toEqual(["new", "a", "b"]);
  });

  it("finds previous and next rows", () => {
    expect(rowNeighbours(["a", "b", "c"], "b")).toEqual({ index: 1, total: 3, prev: "a", next: "c" });
    expect(rowNeighbours(["a", "b"], "a")).toMatchObject({ prev: null, next: "b" });
    expect(rowNeighbours(["a"], "zz")).toMatchObject({ index: -1, prev: null, next: null });
  });
});
