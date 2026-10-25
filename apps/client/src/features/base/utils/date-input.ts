import { parseCellDate } from "@/features/base/utils/date-format";

// Conversions between stored date cells and the picker's "YYYY-MM-DD" /
// "HH:mm" strings. A date without time is stored as UTC midnight of the
// picked day; a date with time is the picked local time as an instant.

const pad = (n: number) => String(n).padStart(2, "0");

export type DateEditorState = { day: string | null; time: string };

export function toEditorState(value: unknown, includeTime: boolean): DateEditorState {
  const d = parseCellDate(value);
  if (!d) return { day: null, time: "" };
  if (!includeTime) {
    return {
      day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      time: "",
    };
  }
  return {
    day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function fromEditorState(
  state: DateEditorState,
  includeTime: boolean,
): string | null {
  if (!state.day || !/^\d{4}-\d{2}-\d{2}$/.test(state.day)) return null;
  if (!includeTime) return `${state.day}T00:00:00.000Z`;
  const [y, m, d] = state.day.split("-").map(Number);
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(state.time)
    ? state.time.split(":").map(Number)
    : [0, 0];
  const local = new Date(y, m - 1, d, hh, mm);
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}
