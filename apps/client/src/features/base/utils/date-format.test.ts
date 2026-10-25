import { describe, expect, it } from "vitest";
import {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  effectiveDateFormat,
  formatCellDate,
  formatDateTokens,
  formatRelativeDate,
  hasHourToken,
  isDateOnlyValue,
  parseCellDate,
  RELATIVE_DATE_FORMAT,
  toDateOnlyValue,
} from "./date-format";

// Monday 5 October 2026, 14:07:03 local time
const local = new Date(2026, 9, 5, 14, 7, 3);
const utc = new Date("2026-10-05T14:07:03Z");

describe("formatDateTokens", () => {
  it.each([
    ["YYYY YY", "2026 26"],
    ["MMMM MMM MM M", "October Oct 10 10"],
    ["DD D", "05 5"],
    ["dddd ddd", "Monday Mon"],
    ["HH H hh h", "14 14 02 2"],
    ["mm ss", "07 03"],
    ["A a", "PM pm"],
    ["MMM D, YYYY", "Oct 5, 2026"],
    ["DD/MM/YYYY HH:mm", "05/10/2026 14:07"],
    ["[Week of] D MMMM", "Week of 5 October"],
    ["[YYYY] YYYY", "YYYY 2026"],
  ])("%j -> %j (local)", (format, expected) => {
    expect(formatDateTokens(local, format, { locale: "en-US" })).toBe(expected);
  });

  it("reads UTC fields when asked", () => {
    expect(
      formatDateTokens(utc, "YYYY-MM-DD HH:mm dddd", { locale: "en-US", utc: true }),
    ).toBe("2026-10-05 14:07 Monday");
  });

  it("uses Intl names in the UI language", () => {
    const fr = formatDateTokens(local, "MMMM dddd", { locale: "fr-FR" });
    expect(fr).toBe("octobre lundi");
    const de = formatDateTokens(local, "MMMM", { locale: "de-DE" });
    expect(de).toBe("Oktober");
  });

  it("pads small years and handles 12 AM / PM", () => {
    expect(formatDateTokens(new Date(2026, 0, 1, 0, 5), "h:mm A")).toBe("12:05 AM");
    expect(formatDateTokens(new Date(2026, 0, 1, 12, 5), "hh:mm a")).toBe("12:05 pm");
  });
});

describe("effectiveDateFormat", () => {
  it("defaults to MMM D, YYYY", () => {
    expect(effectiveDateFormat()).toBe(DEFAULT_DATE_FORMAT);
    expect(effectiveDateFormat({ dateFormat: "  " })).toBe(DEFAULT_DATE_FORMAT);
  });

  it("appends the time unless the format has an hour token", () => {
    expect(effectiveDateFormat({ includeTime: true })).toBe("MMM D, YYYY HH:mm");
    expect(effectiveDateFormat({ includeTime: true, timeFormat: "12h" })).toBe(
      "MMM D, YYYY h:mm A",
    );
    expect(
      effectiveDateFormat({ includeTime: true, dateFormat: "DD/MM/YYYY HH:mm" }),
    ).toBe("DD/MM/YYYY HH:mm");
    expect(effectiveDateFormat({ includeTime: true, dateFormat: "[h] D" })).toBe(
      "[h] D HH:mm",
    );
    expect(
      effectiveDateFormat({ includeTime: true, dateFormat: RELATIVE_DATE_FORMAT }),
    ).toBe(RELATIVE_DATE_FORMAT);
  });

  it("detects hour tokens outside brackets only", () => {
    expect(hasHourToken("HH:mm")).toBe(true);
    expect(hasHourToken("h A")).toBe(true);
    expect(hasHourToken("YYYY [at hh]")).toBe(false);
  });
});

describe("parseCellDate / date-only values", () => {
  it("parses ISO strings and date-only strings as UTC midnight", () => {
    expect(parseCellDate("2026-10-05")?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(parseCellDate("2026-10-05T14:07:03Z")?.getTime()).toBe(utc.getTime());
    expect(parseCellDate("nope")).toBeNull();
    expect(parseCellDate(null)).toBeNull();
    expect(parseCellDate(42)).toBeNull();
  });

  it("recognises date-only values", () => {
    expect(isDateOnlyValue("2026-10-05")).toBe(true);
    expect(isDateOnlyValue("2026-10-05T00:00:00.000Z")).toBe(true);
    expect(isDateOnlyValue("2026-10-05T00:00:00Z")).toBe(true);
    expect(isDateOnlyValue("2026-10-05T10:00:00.000Z")).toBe(false);
    expect(toDateOnlyValue(2026, 9, 5)).toBe("2026-10-05T00:00:00.000Z");
  });
});

describe("formatCellDate", () => {
  it("returns empty text for empty values", () => {
    expect(formatCellDate(null)).toBe("");
    expect(formatCellDate("")).toBe("");
    expect(formatCellDate("garbage")).toBe("");
  });

  it("shows date-only values on the same day in every time zone", () => {
    expect(formatCellDate("2026-10-05T00:00:00.000Z", { locale: "en-US" })).toBe(
      "Oct 5, 2026",
    );
    expect(
      formatCellDate("2026-10-05", { dateFormat: "DD/MM/YYYY", locale: "en-US" }),
    ).toBe("05/10/2026");
  });

  it("formats with time in local time when includeTime is set", () => {
    expect(
      formatCellDate(local.toISOString(), {
        includeTime: true,
        timeFormat: "12h",
        locale: "en-US",
      }),
    ).toBe("Oct 5, 2026 2:07 PM");
  });

  it("supports every preset", () => {
    const now = new Date(local.getTime() + 3 * 86400000);
    const out = DATE_FORMAT_PRESETS.map((f) =>
      formatCellDate(local.toISOString(), { dateFormat: f, locale: "en-US", utc: false, now }),
    );
    expect(out).toEqual([
      "Oct 5, 2026",
      "05/10/2026",
      "10/05/2026",
      "2026-10-05",
      "5 October 2026",
      "Monday, 5 October 2026",
      "05/10/2026 14:07",
      "3 days ago",
    ]);
  });
});

describe("formatRelativeDate", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const at = (ms: number) => new Date(now.getTime() + ms);

  it.each([
    [-3 * 86400000, "3 days ago"],
    [2 * 3600000, "in 2 hours"],
    [-1 * 86400000, "yesterday"],
    [86400000, "tomorrow"],
    [-30 * 1000, "30 seconds ago"],
    [-5 * 60000, "5 minutes ago"],
    [-60 * 86400000, "2 months ago"],
    [400 * 86400000, "next year"],
  ])("%d ms -> %s", (offset, expected) => {
    expect(formatRelativeDate(at(offset), now, "en-US")).toBe(expected);
  });

  it("follows the locale", () => {
    expect(formatRelativeDate(at(-3 * 86400000), now, "fr-FR")).toBe("il y a 3 jours");
  });
});
