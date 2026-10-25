import {
  SeparatorStyle,
  NumberOptions,
} from "@/features/base/types/base.types";

// Number display for base cells.
//  - plain:    1,234.5
//  - currency: $1,234.50 (symbol from currencySymbol, else from currencyCode)
//  - percent:  the stored value is the percentage itself: 42 -> "42%"
//  - progress: same scale as percent; progressPercent() gives the bar width

const SEPARATORS: Record<
  Exclude<SeparatorStyle, "local">,
  { group: string; decimal: string }
> = {
  none: { group: "", decimal: "." },
  comma_period: { group: ",", decimal: "." },
  period_comma: { group: ".", decimal: "," },
  space_comma: { group: "\u00a0", decimal: "," },
  space_period: { group: "\u00a0", decimal: "." },
};

const MAX_FRACTION_DIGITS = 10;

function safeNumberFormat(
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    return new Intl.NumberFormat("en-US", options);
  }
}

function fractionDigits(opts: NumberOptions) {
  if (typeof opts.precision === "number") {
    const p = Math.max(0, Math.min(20, Math.trunc(opts.precision)));
    return { minimumFractionDigits: p, maximumFractionDigits: p };
  }
  if (opts.format === "currency") {
    return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  }
  return { minimumFractionDigits: 0, maximumFractionDigits: MAX_FRACTION_DIGITS };
}

// Formats the absolute value with the chosen separators.
function formatDigits(
  value: number,
  opts: NumberOptions,
  locale?: string,
): string {
  const sep = opts.separators ?? "comma_period";
  if (sep === "local") {
    return safeNumberFormat(locale, fractionDigits(opts)).format(value);
  }
  const chars = SEPARATORS[sep] ?? SEPARATORS.comma_period;
  const parts = safeNumberFormat("en-US", {
    ...fractionDigits(opts),
    useGrouping: chars.group !== "",
  }).formatToParts(value);
  return parts
    .map((p) =>
      p.type === "group" ? chars.group : p.type === "decimal" ? chars.decimal : p.value,
    )
    .join("");
}

export function currencySymbolFor(code: string, locale?: string): string {
  try {
    const part = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? code;
  } catch {
    return code;
  }
}

export function formatNumberValue(
  value: unknown,
  opts: NumberOptions = {},
  locale?: string,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const negative = value < 0;
  const digits = formatDigits(Math.abs(value), opts, locale);
  // rounding can turn a tiny negative into "0"
  const sign = negative && /[1-9]/.test(digits) ? "-" : "";
  switch (opts.format) {
    case "currency": {
      const symbol =
        opts.currencySymbol?.trim() ||
        currencySymbolFor(opts.currencyCode || "USD", locale);
      return `${sign}${symbol}${digits}`;
    }
    case "percent":
    case "progress":
      return `${sign}${digits}%`;
    default:
      return `${sign}${digits}`;
  }
}

// Bar width (0-100) for the progress format.
export function progressPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
