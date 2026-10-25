import {
  PropertyType,
  FilterOp,
  FormulaOptions,
  BaseProperty,
  PersonOptions,
} from "@/features/base/types/base.types";

// Which filter operators apply to which property, derived from the server
// filter compiler (engine/filter-compiler.ts): text-like cells take the text
// operators, choice and person ids take any/none, arrays take any/all/none,
// timestamps take the date operators, numbers the comparisons and booleans
// eq/neq. isEmpty/isNotEmpty work for every stored cell.

type PropertyLike = Pick<BaseProperty, "type" | "typeOptions">;

export const TEXT_OPERATORS: FilterOp[] = [
  "contains",
  "ncontains",
  "eq",
  "neq",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
];

export const NUMBER_OPERATORS: FilterOp[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "isEmpty",
  "isNotEmpty",
];

export const CHECKBOX_OPERATORS: FilterOp[] = ["eq", "neq"];

export const CHOICE_OPERATORS: FilterOp[] = [
  "eq",
  "neq",
  "any",
  "none",
  "isEmpty",
  "isNotEmpty",
];

export const MULTI_VALUE_OPERATORS: FilterOp[] = [
  "any",
  "all",
  "none",
  "isEmpty",
  "isNotEmpty",
];

export const SINGLE_PERSON_OPERATORS: FilterOp[] = [
  "any",
  "none",
  "isEmpty",
  "isNotEmpty",
];

export const DATE_OPERATORS: FilterOp[] = [
  "eq",
  "neq",
  "before",
  "after",
  "onOrBefore",
  "onOrAfter",
  "isWithin",
  "isEmpty",
  "isNotEmpty",
];

// created / edited times always have a value
export const SYSTEM_DATE_OPERATORS: FilterOp[] = DATE_OPERATORS.filter(
  (op) => op !== "isEmpty" && op !== "isNotEmpty",
);

export const FILE_OPERATORS: FilterOp[] = ["isEmpty", "isNotEmpty"];

export const PAGE_OPERATORS: FilterOp[] = [
  "eq",
  "neq",
  "isEmpty",
  "isNotEmpty",
];

export const LAST_EDITED_BY_OPERATORS: FilterOp[] = ["any", "none"];

const BY_TYPE: Partial<Record<PropertyType, FilterOp[]>> = {
  text: TEXT_OPERATORS,
  longText: TEXT_OPERATORS,
  url: TEXT_OPERATORS,
  email: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  checkbox: CHECKBOX_OPERATORS,
  select: CHOICE_OPERATORS,
  status: CHOICE_OPERATORS,
  multiSelect: MULTI_VALUE_OPERATORS,
  date: DATE_OPERATORS,
  createdAt: SYSTEM_DATE_OPERATORS,
  lastEditedAt: SYSTEM_DATE_OPERATORS,
  file: FILE_OPERATORS,
  page: PAGE_OPERATORS,
  lastEditedBy: LAST_EDITED_BY_OPERATORS,
};

export function filterOperatorsFor(property: PropertyLike): FilterOp[] {
  switch (property.type) {
    case "person":
      return (property.typeOptions as PersonOptions)?.allowMultiple
        ? MULTI_VALUE_OPERATORS
        : SINGLE_PERSON_OPERATORS;
    case "formula":
      switch ((property.typeOptions as FormulaOptions)?.resultType) {
        case "number":
          return NUMBER_OPERATORS;
        case "boolean":
          return CHECKBOX_OPERATORS;
        case "date":
          return DATE_OPERATORS;
        default:
          return TEXT_OPERATORS;
      }
    default:
      return BY_TYPE[property.type] ?? [];
  }
}

// What the value input of a condition edits.
export type FilterValueKind =
  | "none"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "dateRange"
  | "choice"
  | "choices"
  | "users"
  | "page";

export function filterValueKind(
  property: PropertyLike,
  op: FilterOp,
): FilterValueKind {
  if (op === "isEmpty" || op === "isNotEmpty") return "none";
  if (op === "isWithin") return "dateRange";
  const formulaType =
    property.type === "formula"
      ? (property.typeOptions as FormulaOptions)?.resultType
      : undefined;
  switch (formulaType ?? property.type) {
    case "number":
      return "number";
    case "checkbox":
    case "boolean":
      return "boolean";
    case "date":
    case "createdAt":
    case "lastEditedAt":
      return "date";
    case "select":
    case "status":
      return op === "any" || op === "none" ? "choices" : "choice";
    case "multiSelect":
      return "choices";
    case "person":
    case "lastEditedBy":
      return "users";
    case "page":
      return "page";
    default:
      return "text";
  }
}

export function isOperatorAllowed(
  property: PropertyLike,
  op: FilterOp,
): boolean {
  return filterOperatorsFor(property).includes(op);
}

// i18n keys for the operator labels.
export const FILTER_OPERATOR_LABELS: Record<FilterOp, string> = {
  eq: "is",
  neq: "is not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
  ncontains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  before: "is before",
  after: "is after",
  onOrBefore: "is on or before",
  onOrAfter: "is on or after",
  any: "is any of",
  none: "is none of",
  all: "has all of",
  isWithin: "is within",
};
