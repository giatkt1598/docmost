// Resolves the date filter values the client sends into a UTC [start, end)
// range. Weeks start on Monday.

export type DateRange = { start: Date; end: Date };

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function dayRange(day: Date): DateRange {
  const start = startOfDay(day);
  return { start, end: addDays(start, 1) };
}

export function resolveAnchor(preset: string, now: Date): Date {
  switch (preset) {
    case 'today':
      return now;
    case 'tomorrow':
      return addDays(now, 1);
    case 'yesterday':
      return addDays(now, -1);
    case 'oneWeekAgo':
      return addDays(now, -7);
    case 'oneWeekFromNow':
      return addDays(now, 7);
    case 'oneMonthAgo':
      return addMonths(now, -1);
    case 'oneMonthFromNow':
      return addMonths(now, 1);
    default:
      throw new Error(`Unknown date preset "${preset}"`);
  }
}

export function resolveRange(preset: string, now: Date): DateRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (preset) {
    case 'pastWeek':
      return { start: addDays(today, -7), end: tomorrow };
    case 'pastMonth':
      return { start: addMonths(today, -1), end: tomorrow };
    case 'pastYear':
      return { start: addMonths(today, -12), end: tomorrow };
    case 'thisWeek': {
      const s = startOfWeek(now);
      return { start: s, end: addDays(s, 7) };
    }
    case 'thisMonth': {
      const s = startOfMonth(now);
      return { start: s, end: addMonths(s, 1) };
    }
    case 'thisYear': {
      const s = startOfYear(now);
      return { start: s, end: addMonths(s, 12) };
    }
    case 'nextWeek': {
      const s = addDays(startOfWeek(now), 7);
      return { start: s, end: addDays(s, 7) };
    }
    case 'nextMonth': {
      const s = addMonths(startOfMonth(now), 1);
      return { start: s, end: addMonths(s, 1) };
    }
    case 'nextYear': {
      const s = addMonths(startOfYear(now), 12);
      return { start: s, end: addMonths(s, 12) };
    }
    default:
      throw new Error(`Unknown date range "${preset}"`);
  }
}

// value is { mode: 'exact'|'relative'|'range', ... } from the filter UI.
export function resolveDateFilterValue(
  value: unknown,
  op: string,
  now = new Date(),
): DateRange {
  const v = value as any;
  if (!v || typeof v !== 'object') throw new Error('Invalid date filter value');
  if (v.mode === 'range') return resolveRange(String(v.preset), now);
  if (op === 'isWithin') {
    throw new Error('isWithin needs a range preset');
  }
  if (v.mode === 'exact') {
    const d = new Date(v.date);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
    return dayRange(d);
  }
  if (v.mode === 'relative') {
    return dayRange(resolveAnchor(String(v.preset), now));
  }
  throw new Error('Invalid date filter value');
}
