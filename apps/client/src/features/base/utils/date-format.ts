import { DateOptions } from "@/features/base/types/base.types";

// Date display for base cells. A format string mixes tokens and literal text;
// text in [brackets] is literal. Month and weekday names come from
// Intl.DateTimeFormat in the UI language.

export const DEFAULT_DATE_FORMAT = "MMM D, YYYY";
export const RELATIVE_DATE_FORMAT = "relative";

export const DATE_FORMAT_PRESETS = [
  "MMM D, YYYY",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "D MMMM YYYY",
  "dddd, D MMMM YYYY",
  "DD/MM/YYYY HH:mm",
  RELATIVE_DATE_FORMAT,
] as const;

export const MAX_DATE_FORMAT_LENGTH = 64;

// The label the editor once stored by mistake (picking the suggestion wrote
// its text instead of "relative"). Such values are read as "relative".
const LEGACY_RELATIVE_LABEL_RE = /^relative\s*\(/i;

// A stored format as it should be used: "relative" in any case or with
// spaces, and the old broken label, become exactly "relative". Other
// strings are returned as they are (untrimmed, spaces can be meant).
export function normalizeDateFormat(format: string | null | undefined): string | undefined {
  if (format === null || format === undefined) return undefined;
  const trimmed = format.trim();
  if (trimmed.toLowerCase() === RELATIVE_DATE_FORMAT) return RELATIVE_DATE_FORMAT;
  if (LEGACY_RELATIVE_LABEL_RE.test(trimmed)) return RELATIVE_DATE_FORMAT;
  return format;
}

export type DateFormatOption = { value: string; label: string };

// Suggestions of the "Date format" input: tokens show as themselves, the
// relative preset with a readable label.
export function dateFormatSuggestions(relativeLabel: string): DateFormatOption[] {
  return DATE_FORMAT_PRESETS.map((value) => ({
    value,
    label: value === RELATIVE_DATE_FORMAT ? relativeLabel : value,
  }));
}

// What to store for the text in the input: when it is the label of a
// suggestion, that suggestion's value; otherwise what was typed (checked
// for the relative spellings).
export function resolveDateFormatInput(
  input: string,
  options: DateFormatOption[],
): string {
  const key = input.trim().toLowerCase();
  const hit = options.find((o) => o.label.toLowerCase() === key);
  if (hit) return hit.value;
  return normalizeDateFormat(input) ?? "";
}

const TOKEN_RE =
  /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|ss|A|a/g;

const HOUR_TOKEN_RE = /HH|H|hh|h/;

export type DateFormatOptions = DateOptions & {
  locale?: string;
  // read the calendar fields in UTC (date-only values) instead of local time
  utc?: boolean;
  // reference time for the relative format
  now?: Date;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Parses a stored cell value. "YYYY-MM-DD" is read as UTC midnight.
export function parseCellDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || value === "") return null;
  const d = new Date(DATE_ONLY_RE.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Date properties without a time store the picked day as UTC midnight, so
// those values are shown in UTC to keep the same day in every time zone.
export function isDateOnlyValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return DATE_ONLY_RE.test(value) || /T00:00(:00(\.000)?)?(Z|\+00:00)$/.test(value);
}

// The stored value for a calendar day picked in the UI.
export function toDateOnlyValue(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString();
}

// True when the format prints hours (literal text excluded).
export function hasHourToken(format: string): boolean {
  return HOUR_TOKEN_RE.test(format.replace(/\[[^\]]*\]/g, ""));
}

// The format actually used: default when empty, time appended when needed.
export function effectiveDateFormat(opts: DateOptions = {}): string {
  const stored = normalizeDateFormat(opts.dateFormat);
  const base = stored?.trim() ? stored : DEFAULT_DATE_FORMAT;
  if (base === RELATIVE_DATE_FORMAT) return base;
  if (!opts.includeTime || hasHourToken(base)) return base;
  return `${base} ${opts.timeFormat === "12h" ? "h:mm A" : "HH:mm"}`;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function intlFormatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let f = formatterCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, options);
    } catch {
      f = new Intl.DateTimeFormat("en-US", options);
    }
    formatterCache.set(key, f);
  }
  return f;
}

function name(
  date: Date,
  locale: string | undefined,
  utc: boolean,
  options: Intl.DateTimeFormatOptions,
): string {
  return intlFormatter(locale, {
    ...options,
    ...(utc ? { timeZone: "UTC" } : {}),
  }).format(date);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function formatDateTokens(
  date: Date,
  format: string,
  opts: { locale?: string; utc?: boolean } = {},
): string {
  const { locale, utc = false } = opts;
  const y = utc ? date.getUTCFullYear() : date.getFullYear();
  const mo = utc ? date.getUTCMonth() : date.getMonth();
  const d = utc ? date.getUTCDate() : date.getDate();
  const h = utc ? date.getUTCHours() : date.getHours();
  const mi = utc ? date.getUTCMinutes() : date.getMinutes();
  const s = utc ? date.getUTCSeconds() : date.getSeconds();
  const h12 = h % 12 === 0 ? 12 : h % 12;

  return format.replace(TOKEN_RE, (token: string, literal?: string) => {
    if (literal !== undefined) return literal;
    switch (token) {
      case "YYYY":
        return pad(y, 4);
      case "YY":
        return pad(y % 100);
      case "MMMM":
        return name(date, locale, utc, { month: "long" });
      case "MMM":
        return name(date, locale, utc, { month: "short" });
      case "MM":
        return pad(mo + 1);
      case "M":
        return String(mo + 1);
      case "dddd":
        return name(date, locale, utc, { weekday: "long" });
      case "ddd":
        return name(date, locale, utc, { weekday: "short" });
      case "DD":
        return pad(d);
      case "D":
        return String(d);
      case "HH":
        return pad(h);
      case "H":
        return String(h);
      case "hh":
        return pad(h12);
      case "h":
        return String(h12);
      case "mm":
        return pad(mi);
      case "ss":
        return pad(s);
      case "A":
        return h < 12 ? "AM" : "PM";
      case "a":
        return h < 12 ? "am" : "pm";
      default:
        return token;
    }
  });
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 30],
  ["month", 12],
  ["year", Infinity],
];

// "3 days ago", "in 2 hours", "yesterday" in the UI language.
export function formatRelativeDate(
  date: Date,
  now: Date = new Date(),
  locale?: string,
): string {
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  }
  let amount = (date.getTime() - now.getTime()) / 1000;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// Formats a date cell. Returns "" for empty or invalid values.
export function formatCellDate(
  value: unknown,
  opts: DateFormatOptions = {},
): string {
  const date = parseCellDate(value);
  if (!date) return "";
  const format = effectiveDateFormat(opts);
  if (format === RELATIVE_DATE_FORMAT) {
    return formatRelativeDate(date, opts.now, opts.locale);
  }
  const utc = opts.utc ?? (!opts.includeTime && isDateOnlyValue(value));
  return formatDateTokens(date, format, { locale: opts.locale, utc });
}
