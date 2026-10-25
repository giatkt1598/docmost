// Functions of the formula language, mirrored from the server registry
// (engine/formula/functions.ts) for the formula editor's help list.

export type FormulaFunctionInfo = {
  name: string;
  signature: string;
  description: string;
  group: "logic" | "text" | "number" | "date";
};

export const FORMULA_FUNCTIONS: FormulaFunctionInfo[] = [
  { group: "logic", name: "if", signature: "if(condition, then, else)", description: 'Returns "then" when the condition is true, otherwise "else"' },
  { group: "logic", name: "ifs", signature: "ifs(condition1, value1, …, else)", description: 'Returns the value of the first true condition, or "else"' },
  { group: "logic", name: "and", signature: "and(a, b, …)", description: "True when every argument is true" },
  { group: "logic", name: "or", signature: "or(a, b, …)", description: "True when at least one argument is true" },
  { group: "logic", name: "not", signature: "not(value)", description: "Inverts a boolean" },
  { group: "logic", name: "empty", signature: "empty(value)", description: "True when the value is empty (no value, blank text, empty list)" },
  { group: "text", name: "concat", signature: "concat(a, b, …)", description: "Joins values into one text" },
  { group: "text", name: "length", signature: "length(value)", description: "Number of characters of a text, or of items in a list" },
  { group: "text", name: "lower", signature: "lower(text)", description: "Converts a text to lower case" },
  { group: "text", name: "upper", signature: "upper(text)", description: "Converts a text to upper case" },
  { group: "text", name: "trim", signature: "trim(text)", description: "Removes spaces at both ends of a text" },
  { group: "text", name: "contains", signature: "contains(text, part)", description: "True when the text contains the part (or the list the item)" },
  { group: "text", name: "replace", signature: "replace(text, find, with)", description: 'Replaces every occurrence of "find" with "with"' },
  { group: "text", name: "toText", signature: "toText(value)", description: "Converts any value to text" },
  { group: "number", name: "round", signature: "round(number, digits?)", description: "Rounds a number, optionally to a number of decimal digits" },
  { group: "number", name: "floor", signature: "floor(number)", description: "Rounds a number down" },
  { group: "number", name: "ceil", signature: "ceil(number)", description: "Rounds a number up" },
  { group: "number", name: "abs", signature: "abs(number)", description: "Absolute value of a number" },
  { group: "number", name: "min", signature: "min(a, b, …)", description: "Smallest of the numbers (empty values are skipped)" },
  { group: "number", name: "max", signature: "max(a, b, …)", description: "Largest of the numbers (empty values are skipped)" },
  { group: "number", name: "sum", signature: "sum(a, b, …)", description: "Adds the numbers (empty values count as 0)" },
  { group: "number", name: "toNumber", signature: "toNumber(value)", description: "Converts a text, boolean or date (milliseconds) to a number" },
  { group: "date", name: "now", signature: "now()", description: "The current date and time" },
  { group: "date", name: "today", signature: "today()", description: "The current date at midnight (UTC)" },
  { group: "date", name: "dateAdd", signature: "dateAdd(date, amount, unit)", description: 'Adds an amount of "years", "months", "weeks", "days", "hours" or "minutes"' },
  { group: "date", name: "dateBetween", signature: "dateBetween(date1, date2, unit)", description: "date1 - date2 in whole units" },
  { group: "date", name: "formatDate", signature: "formatDate(date, format)", description: 'Formats a date, e.g. formatDate(now(), "DD/MM/YYYY")' },
  { group: "date", name: "year", signature: "year(date)", description: "Year of a date" },
  { group: "date", name: "month", signature: "month(date)", description: "Month of a date (1-12)" },
  { group: "date", name: "day", signature: "day(date)", description: "Day of the month of a date" },
];

// prop("Name") with the name quoted the way the tokenizer reads it.
export function propReference(name: string): string {
  return `prop("${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
}

export type InsertResult = { value: string; caret: number };

// Replaces the selection with `text`; the caret goes to `caretOffset`
// inside the inserted text (default: after it).
export function insertText(
  source: string,
  selStart: number,
  selEnd: number,
  text: string,
  caretOffset = text.length,
): InsertResult {
  const start = Math.max(0, Math.min(selStart, source.length));
  const end = Math.max(start, Math.min(selEnd, source.length));
  return {
    value: source.slice(0, start) + text + source.slice(end),
    caret: start + caretOffset,
  };
}

// name() with the caret between the parentheses.
export function insertFunction(source: string, selStart: number, selEnd: number, name: string) {
  return insertText(source, selStart, selEnd, `${name}()`, name.length + 1);
}

export function insertProperty(source: string, selStart: number, selEnd: number, propName: string) {
  return insertText(source, selStart, selEnd, propReference(propName));
}

export function filterFunctions(query: string): FormulaFunctionInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return FORMULA_FUNCTIONS;
  return FORMULA_FUNCTIONS.filter(
    (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
  );
}
