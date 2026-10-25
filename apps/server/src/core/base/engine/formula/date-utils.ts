// Date helpers for formulas. The server has no viewer timezone, so all
// calendar math is done in UTC.

export type DateUnit =
  | 'years'
  | 'months'
  | 'weeks'
  | 'days'
  | 'hours'
  | 'minutes';

const UNIT_ALIASES: Record<string, DateUnit> = {
  year: 'years',
  years: 'years',
  month: 'months',
  months: 'months',
  week: 'weeks',
  weeks: 'weeks',
  day: 'days',
  days: 'days',
  hour: 'hours',
  hours: 'hours',
  minute: 'minutes',
  minutes: 'minutes',
};

export const DATE_UNITS: readonly DateUnit[] = [
  'years',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
];

export function parseDateUnit(unit: string): DateUnit | null {
  return UNIT_ALIASES[unit.trim().toLowerCase()] ?? null;
}

const MS: Record<'weeks' | 'days' | 'hours' | 'minutes', number> = {
  weeks: 7 * 24 * 3600 * 1000,
  days: 24 * 3600 * 1000,
  hours: 3600 * 1000,
  minutes: 60 * 1000,
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// Adds whole months, clamping the day to the end of the target month
// (Jan 31 + 1 month = Feb 28/29).
function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonth(targetYear, targetMonth));
  const out = new Date(date.getTime());
  out.setUTCFullYear(targetYear, targetMonth, day);
  return out;
}

export function dateAdd(date: Date, amount: number, unit: DateUnit): Date {
  switch (unit) {
    case 'years':
      return addMonths(date, Math.trunc(amount) * 12);
    case 'months':
      return addMonths(date, Math.trunc(amount));
    default:
      return new Date(date.getTime() + amount * MS[unit]);
  }
}

// a - b in whole units, truncated toward zero.
export function dateBetween(a: Date, b: Date, unit: DateUnit): number {
  if (unit === 'years' || unit === 'months') {
    let months =
      (a.getUTCFullYear() - b.getUTCFullYear()) * 12 +
      (a.getUTCMonth() - b.getUTCMonth());
    const shifted = addMonths(b, months).getTime();
    if (months > 0 && shifted > a.getTime()) months--;
    if (months < 0 && shifted < a.getTime()) months++;
    return unit === 'years' ? Math.trunc(months / 12) : months;
  }
  return Math.trunc((a.getTime() - b.getTime()) / MS[unit]);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

const FORMAT_TOKENS =
  /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|ss|A|a/g;

// Formats a date with the tokens of the base date format (UTC, English
// names). Text in [brackets] is kept as is.
export function formatDate(date: Date, format: string): string {
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  const wd = date.getUTCDay();
  const h = date.getUTCHours();
  const mi = date.getUTCMinutes();
  const s = date.getUTCSeconds();
  const h12 = h % 12 === 0 ? 12 : h % 12;

  return format.replace(FORMAT_TOKENS, (token, literal) => {
    if (literal !== undefined) return literal;
    switch (token) {
      case 'YYYY':
        return pad(y, 4);
      case 'YY':
        return pad(y % 100);
      case 'MMMM':
        return MONTHS[mo];
      case 'MMM':
        return MONTHS[mo].slice(0, 3);
      case 'MM':
        return pad(mo + 1);
      case 'M':
        return String(mo + 1);
      case 'dddd':
        return WEEKDAYS[wd];
      case 'ddd':
        return WEEKDAYS[wd].slice(0, 3);
      case 'DD':
        return pad(d);
      case 'D':
        return String(d);
      case 'HH':
        return pad(h);
      case 'H':
        return String(h);
      case 'hh':
        return pad(h12);
      case 'h':
        return String(h12);
      case 'mm':
        return pad(mi);
      case 'ss':
        return pad(s);
      case 'A':
        return h < 12 ? 'AM' : 'PM';
      case 'a':
        return h < 12 ? 'am' : 'pm';
      default:
        return token;
    }
  });
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}
