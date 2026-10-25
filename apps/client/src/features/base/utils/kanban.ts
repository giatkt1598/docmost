import {
  BaseProperty,
  BaseRow,
  BaseViewConfig,
  ChoiceOptions,
  GroupColumn,
  NO_VALUE_COLUMN,
  PropertyChoice,
} from "@/features/base/types/base.types";
import { orderedChoices } from "@/features/base/utils/choice-colors";
import { positionBetween } from "@/features/base/utils/position";
import { newChoiceId } from "@/features/base/utils/cell-values";

// Pure logic of the kanban view.

export type BoardColumn = {
  // a choice id, or NO_VALUE_COLUMN
  id: string;
  choice: PropertyChoice | null;
  hidden: boolean;
};

export const GROUPABLE_TYPES = new Set(["select", "status"]);

export function isGroupable(p: Pick<BaseProperty, "type" | "pendingType">): boolean {
  return GROUPABLE_TYPES.has(p.type) && !p.pendingType;
}

export function groupableProperties(properties: BaseProperty[]): BaseProperty[] {
  return properties.filter(isGroupable);
}

// The property a new board groups by: a status first, then a select.
export function defaultGroupProperty(properties: BaseProperty[]): BaseProperty | null {
  const list = groupableProperties(properties);
  return list.find((p) => p.type === "status") ?? list[0] ?? null;
}

// The group property of a view, when it still exists and can group.
export function resolveGroupProperty(
  properties: BaseProperty[],
  config: BaseViewConfig,
): BaseProperty | null {
  const p = properties.find((x) => x.id === config.groupByPropertyId);
  return p && isGroupable(p) ? p : null;
}

// Columns in display order: the view's choiceOrder, then the property's
// own order for choices not listed. "No value" goes first unless the view
// placed it elsewhere.
export function boardColumns(
  property: BaseProperty,
  config: BaseViewConfig,
): BoardColumn[] {
  const choices = orderedChoices(property.typeOptions as ChoiceOptions);
  const byId = new Map(choices.map((c) => [c.id, c]));
  const known = new Set([...byId.keys(), NO_VALUE_COLUMN]);
  const order: string[] = [];
  for (const id of config.choiceOrder ?? []) {
    if (known.has(id) && !order.includes(id)) order.push(id);
  }
  if (!order.includes(NO_VALUE_COLUMN)) order.unshift(NO_VALUE_COLUMN);
  for (const c of choices) if (!order.includes(c.id)) order.push(c.id);
  const hidden = new Set(config.hiddenChoiceIds ?? []);
  return order.map((id) => ({
    id,
    choice: id === NO_VALUE_COLUMN ? null : byId.get(id)!,
    hidden: hidden.has(id),
  }));
}

export function columnOf(propertyId: string, columnId: string): GroupColumn {
  return { propertyId, value: columnId === NO_VALUE_COLUMN ? null : columnId };
}

// The cell patch that puts a row into a column.
export function cellsForColumn(propertyId: string, columnId: string) {
  return { [propertyId]: columnId === NO_VALUE_COLUMN ? null : columnId };
}

// Column id of a row (a deleted choice counts as no value).
export function columnIdOfRow(row: BaseRow, property: BaseProperty): string {
  const v = row.cells?.[property.id];
  const ids = new Set(orderedChoices(property.typeOptions as ChoiceOptions).map((c) => c.id));
  return typeof v === "string" && ids.has(v) ? v : NO_VALUE_COLUMN;
}

// New choiceOrder after dragging column `movedId` next to `targetId`.
export function moveColumn(
  columns: BoardColumn[],
  movedId: string,
  targetId: string,
  edge: "left" | "right",
): string[] {
  const ids = columns.map((c) => c.id);
  if (movedId === targetId || !ids.includes(movedId) || !ids.includes(targetId)) return ids;
  const rest = ids.filter((id) => id !== movedId);
  rest.splice(rest.indexOf(targetId) + (edge === "right" ? 1 : 0), 0, movedId);
  return rest;
}

export function setColumnHidden(
  hiddenIds: string[] | undefined,
  columnId: string,
  hide: boolean,
): string[] {
  const set = new Set(hiddenIds ?? []);
  if (hide) set.add(columnId);
  else set.delete(columnId);
  return [...set];
}

// Position for a card dropped next to `targetId` (null: at the end of the
// column). `cards` is the target column in display order.
export function cardDropPosition(
  cards: Pick<BaseRow, "id" | "position">[],
  movedId: string,
  targetId: string | null,
  edge: "top" | "bottom",
): string {
  const list = cards.filter((c) => c.id !== movedId);
  if (targetId === null) {
    return positionBetween(list[list.length - 1]?.position, null);
  }
  const idx = list.findIndex((c) => c.id === targetId);
  if (idx < 0) return positionBetween(list[list.length - 1]?.position, null);
  const [before, after] = edge === "top" ? [list[idx - 1], list[idx]] : [list[idx], list[idx + 1]];
  return positionBetween(before?.position, after?.position);
}

// Options of the Status property created from the empty state.
export function seedStatusOptions(names: { todo: string; inProgress: string; done: string }) {
  const choices: PropertyChoice[] = [
    { id: newChoiceId(), name: names.todo, color: "gray", category: "todo" },
    { id: newChoiceId(), name: names.inProgress, color: "blue", category: "inProgress" },
    { id: newChoiceId(), name: names.done, color: "green", category: "complete" },
  ];
  return { choices, choiceOrder: choices.map((c) => c.id) };
}

// Card properties: those listed in visiblePropertyIds, in property order,
// without the primary (always shown as the title).
export function cardProperties(
  ordered: BaseProperty[],
  visibleIds: string[] | undefined,
): BaseProperty[] {
  const visible = new Set(visibleIds ?? []);
  return ordered.filter((p) => !p.isPrimary && visible.has(p.id));
}
