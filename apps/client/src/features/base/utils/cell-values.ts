import {
  AttachedFile,
  BaseProperty,
  BaseRow,
  RowQuery,
} from "@/features/base/types/base.types";
import { InsertPolicy } from "@/features/base/utils/row-cache";
import { normalizeRowQuery } from "@/features/base/utils/rows-params";
import { stableStringify } from "@/features/base/utils/view-drafts";

// Values the server accepts per type (see validateCells).
export const TEXT_LIMIT = 1000;
export const LONG_TEXT_LIMIT = 25000;

// The value a cell shows: stored cells, or row columns for system types.
export function readCell(property: Pick<BaseProperty, "id" | "type">, row: BaseRow): unknown {
  switch (property.type) {
    case "createdAt":
      return row.createdAt;
    case "lastEditedAt":
      return row.updatedAt;
    case "lastEditedBy":
      return row.lastUpdatedById ?? row.creatorId;
    default:
      return row.cells?.[property.id] ?? null;
  }
}

export function isEmptyCell(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function isFormulaError(value: unknown): value is { __err: string } {
  return typeof value === "object" && value !== null && "__err" in value;
}

// Text typed into a text-like cell; blank clears the cell.
export function textCellValue(type: string, text: string): string | null {
  const limit = type === "longText" ? LONG_TEXT_LIMIT : TEXT_LIMIT;
  const value = type === "longText" ? text : text.trim();
  if (value.trim() === "") return null;
  return value.slice(0, limit);
}

// Lenient number parsing: "1,234.5", "1.234,5", "12 %", "$8".
export function parseNumberInput(text: string): number | null | undefined {
  if (text.trim() === "") return null;
  // a currency symbol or code in front is allowed
  let s = text.trim().replace(/[\s\u00a0%]/g, "").replace(/^[^\d\-+.,]{1,4}(?=[\d\-+.,])/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // the separator that comes last is the decimal one
    s = lastComma > lastDot
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "1,5" is a decimal, "1,234" / "1,234,567" are thousands
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined; // undefined = not a number
}

export function normalizeUrl(text: string): string | null {
  const v = text.trim();
  if (!v) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
}

// Only http(s) and mailto links are rendered as anchors.
export function safeHref(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url) ? url : null;
}

export function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function asStringList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return list.filter((v): v is string => typeof v === "string" && v !== "");
}

export function asFileList(value: unknown): AttachedFile[] {
  return Array.isArray(value)
    ? value.filter((f): f is AttachedFile => !!f && typeof f.id === "string")
    : [];
}

export function fileUrl(file: AttachedFile): string {
  return file.url || `/api/files/${file.id}/${encodeURIComponent(file.fileName)}`;
}

export function newChoiceId(): string {
  return `opt${Math.random().toString(36).slice(2, 10)}`;
}

export const sameRowQuery = (a: RowQuery, b: RowQuery) =>
  stableStringify(normalizeRowQuery(a)) === stableStringify(normalizeRowQuery(b));

// Rows created from a view go into that view's list (whatever its filter)
// and into the unfiltered lists.
export const insertIntoView =
  (current: RowQuery): InsertPolicy =>
  (params) =>
    (!params.filter && !params.search) || sameRowQuery(params, current);
