import { describe, expect, it } from "vitest";
import { BaseRow } from "@/features/base/types/base.types";
import {
  asFileList,
  asStringList,
  fileUrl,
  insertIntoView,
  isEmptyCell,
  normalizeUrl,
  parseNumberInput,
  readCell,
  safeHref,
  sameRowQuery,
  textCellValue,
  toggleInList,
} from "./cell-values";
import { fromEditorState, toEditorState } from "./date-input";
import {
  draftDiffers,
  draftKey,
  draftToConfigPatch,
  effectiveQuery,
  readDraft,
  stableStringify,
  writeDraft,
} from "./view-drafts";

const row = {
  id: "r",
  cells: { p: "x" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  lastUpdatedById: null,
  creatorId: "u1",
} as unknown as BaseRow;

describe("cell values", () => {
  it("reads stored and system values", () => {
    expect(readCell({ id: "p", type: "text" }, row)).toBe("x");
    expect(readCell({ id: "q", type: "text" }, row)).toBeNull();
    expect(readCell({ id: "c", type: "createdAt" }, row)).toBe(row.createdAt);
    expect(readCell({ id: "e", type: "lastEditedAt" }, row)).toBe(row.updatedAt);
    expect(readCell({ id: "b", type: "lastEditedBy" }, row)).toBe("u1");
  });

  it("parses numbers leniently", () => {
    expect(parseNumberInput("42")).toBe(42);
    expect(parseNumberInput(" -1,234.5 ")).toBe(-1234.5);
    expect(parseNumberInput("1.234,5")).toBe(1234.5);
    expect(parseNumberInput("1,5")).toBe(1.5);
    expect(parseNumberInput("1,234")).toBe(1234);
    expect(parseNumberInput("12 %")).toBe(12);
    expect(parseNumberInput("$8")).toBe(8);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("abc")).toBeUndefined();
  });

  it("normalizes text, urls and links", () => {
    expect(textCellValue("text", "  hi ")).toBe("hi");
    expect(textCellValue("text", "   ")).toBeNull();
    expect(textCellValue("text", "x".repeat(1200))).toHaveLength(1000);
    expect(textCellValue("longText", " a\nb ")).toBe(" a\nb ");
    expect(normalizeUrl("docmost.com")).toBe("https://docmost.com");
    expect(normalizeUrl("http://a.b")).toBe("http://a.b");
    expect(normalizeUrl(" ")).toBeNull();
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("handles lists and files", () => {
    expect(isEmptyCell([])).toBe(true);
    expect(isEmptyCell(0)).toBe(false);
    expect(toggleInList(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleInList(["a", "b"], "a")).toEqual(["b"]);
    expect(asStringList("x")).toEqual(["x"]);
    expect(asFileList([{ id: "f", fileName: "a b.pdf" }, null, 3])).toHaveLength(1);
    expect(fileUrl({ id: "f", fileName: "a b.pdf" })).toBe("/api/files/f/a%20b.pdf");
  });

  it("inserts new rows into the current view and unfiltered lists", () => {
    const filter = { op: "and" as const, children: [{ propertyId: "p", op: "eq" as const, value: "x" }] };
    const policy = insertIntoView({ filter });
    const r = row;
    expect(policy({}, r)).toBe(true);
    expect(policy({ filter }, r)).toBe(true);
    expect(policy({ search: "q" }, r)).toBe(false);
    expect(sameRowQuery({ sorts: [], search: " " }, {})).toBe(true);
  });
});

describe("date editor values", () => {
  it("stores days without time as UTC midnight", () => {
    expect(toEditorState("2026-10-05T00:00:00.000Z", false)).toEqual({ day: "2026-10-05", time: "" });
    expect(fromEditorState({ day: "2026-10-05", time: "" }, false)).toBe("2026-10-05T00:00:00.000Z");
    expect(fromEditorState({ day: null, time: "" }, false)).toBeNull();
  });

  it("round-trips local date and time", () => {
    const iso = fromEditorState({ day: "2026-10-05", time: "14:30" }, true)!;
    expect(new Date(iso).getHours()).toBe(14);
    expect(toEditorState(iso, true)).toEqual({ day: "2026-10-05", time: "14:30" });
    expect(toEditorState(null, true)).toEqual({ day: null, time: "" });
  });
});

describe("view drafts", () => {
  const filter = { op: "and" as const, children: [{ propertyId: "p", op: "isEmpty" as const }] };
  const sorts = [{ propertyId: "p", direction: "asc" as const }];

  it("uses draft values over saved ones", () => {
    expect(effectiveQuery({ filter, sorts }, null)).toEqual({ filter, sorts });
    expect(effectiveQuery({ filter, sorts }, { sorts: null })).toEqual({ filter, sorts: null });
    expect(effectiveQuery({}, { filter: { op: "and", children: [] } })).toEqual({ filter: null, sorts: null });
  });

  it("detects real differences only", () => {
    expect(draftDiffers({ filter }, null)).toBe(false);
    expect(draftDiffers({ filter }, { filter: { children: filter.children, op: "and" } })).toBe(false);
    expect(draftDiffers({ filter }, { filter: null })).toBe(true);
    expect(draftDiffers({}, { sorts })).toBe(true);
    expect(draftToConfigPatch({ filter, sorts }, { filter: null })).toEqual({ filter: null, sorts });
  });

  it("stores drafts per user and view", () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    const key = draftKey("u1", "v1");
    expect(key).not.toBe(draftKey("u2", "v1"));
    writeDraft(key, { sorts }, store);
    expect(readDraft(key, store)).toEqual({ sorts });
    writeDraft(key, null, store);
    expect(readDraft(key, store)).toBeNull();
    data.set(key, "{broken");
    expect(readDraft(key, store)).toBeNull();
  });

  it("stringifies with sorted keys", () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
  });
});
