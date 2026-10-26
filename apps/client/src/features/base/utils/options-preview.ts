import { DateOptions, NumberOptions } from "@/features/base/types/base.types";
import {
  formatCellDate,
  MAX_DATE_FORMAT_LENGTH,
  normalizeDateFormat,
  RELATIVE_DATE_FORMAT,
} from "@/features/base/utils/date-format";
import { formatNumberValue } from "@/features/base/utils/number-format";

// Live previews and checks for the options editors.

export const NUMBER_PREVIEW_VALUE = 1234.5678;
export const PROGRESS_PREVIEW_VALUE = 42;

export function numberPreview(opts: NumberOptions, locale?: string): string {
  const sample =
    opts.format === "progress" || opts.format === "percent"
      ? PROGRESS_PREVIEW_VALUE
      : NUMBER_PREVIEW_VALUE;
  return formatNumberValue(sample, opts, locale);
}

export type DateFormatIssue = "too-long" | null;

export function dateFormatIssue(format: string | undefined): DateFormatIssue {
  if ((format ?? "").length > MAX_DATE_FORMAT_LENGTH) return "too-long";
  return null;
}

// The sample date shown in the editor: now with time, or today as a
// date-only value. Relative formats show a time three days ago.
export function datePreview(
  opts: DateOptions,
  locale: string | undefined,
  now: Date = new Date(),
): string {
  if (normalizeDateFormat(opts.dateFormat) === RELATIVE_DATE_FORMAT) {
    const past = new Date(now.getTime() - 3 * 86400000);
    return formatCellDate(past.toISOString(), { ...opts, locale, now, utc: false });
  }
  return formatCellDate(now.toISOString(), { ...opts, locale, utc: false });
}

// typeOptions sent for a date property: empty format means "default", so
// the key is left out instead of storing "".
export function cleanDateOptions<T extends DateOptions>(opts: T): T {
  const out = { ...opts };
  const format = normalizeDateFormat(out.dateFormat);
  if (!format?.trim()) delete out.dateFormat;
  else out.dateFormat = format;
  if (!out.includeTime) delete out.timeFormat;
  return out;
}
