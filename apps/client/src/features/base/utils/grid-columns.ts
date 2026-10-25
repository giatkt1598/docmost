import { BaseProperty, BaseViewConfig } from "@/features/base/types/base.types";
import { sortByPosition } from "@/features/base/utils/position";

// Column layout of the table view, from the properties and the view config.

export const DEFAULT_COLUMN_WIDTH = 180;
export const PRIMARY_COLUMN_WIDTH = 260;
export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 800;
// row number / selection / drag handle column
export const GUTTER_WIDTH = 64;
// the "+" header cell
export const ADD_COLUMN_WIDTH = 44;

export type GridColumn = {
  property: BaseProperty;
  width: number;
  // left offset inside the scrolling area, for sticky pinning
  left: number;
  pinned: boolean;
};

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_COLUMN_WIDTH;
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));
}

// Properties in view order: primary first, then propertyOrder, then the
// rest by position (new properties appear at the end).
export function orderProperties(
  properties: BaseProperty[],
  propertyOrder: string[] | undefined,
): BaseProperty[] {
  const sorted = sortByPosition(properties);
  const primary = sorted.filter((p) => p.isPrimary);
  const others = sorted.filter((p) => !p.isPrimary);
  const rank = new Map((propertyOrder ?? []).map((id, i) => [id, i]));
  const listed = others
    .filter((p) => rank.has(p.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const rest = others.filter((p) => !rank.has(p.id));
  return [...primary, ...listed, ...rest];
}

export function columnWidth(
  property: BaseProperty,
  widths: Record<string, number> | undefined,
): number {
  const saved = widths?.[property.id];
  if (typeof saved === "number") return clampWidth(saved);
  return property.isPrimary ? PRIMARY_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH;
}

export function buildColumns(
  properties: BaseProperty[],
  config: BaseViewConfig,
  overrides: Record<string, number> = {},
): GridColumn[] {
  const hidden = new Set(config.hiddenPropertyIds ?? []);
  let left = GUTTER_WIDTH;
  return orderProperties(properties, config.propertyOrder)
    .filter((p) => p.isPrimary || !hidden.has(p.id))
    .map((property) => {
      const width =
        overrides[property.id] !== undefined
          ? clampWidth(overrides[property.id])
          : columnWidth(property, config.propertyWidths);
      const col = { property, width, left, pinned: property.isPrimary };
      left += width;
      return col;
    });
}

// Total width of the grid; rows end at the last column.
export function gridWidth(columns: GridColumn[], withAddColumn: boolean): number {
  return (
    GUTTER_WIDTH +
    columns.reduce((s, c) => s + c.width, 0) +
    (withAddColumn ? ADD_COLUMN_WIDTH : 0)
  );
}

// New propertyOrder after dragging `movedId` before/after `targetId`. The
// order covers every non-primary property, hidden ones included.
export function reorderColumns(
  properties: BaseProperty[],
  propertyOrder: string[] | undefined,
  movedId: string,
  targetId: string,
  edge: "left" | "right",
): string[] {
  const ids = orderProperties(properties, propertyOrder)
    .filter((p) => !p.isPrimary)
    .map((p) => p.id);
  if (movedId === targetId || !ids.includes(movedId) || !ids.includes(targetId)) {
    return ids;
  }
  const without = ids.filter((id) => id !== movedId);
  const at = without.indexOf(targetId) + (edge === "right" ? 1 : 0);
  without.splice(at, 0, movedId);
  return without;
}

export function withWidth(
  widths: Record<string, number> | undefined,
  propertyId: string,
  width: number,
): Record<string, number> {
  return { ...(widths ?? {}), [propertyId]: clampWidth(width) };
}

export function toggleHidden(
  hidden: string[] | undefined,
  propertyId: string,
  hide: boolean,
): string[] {
  const set = new Set(hidden ?? []);
  if (hide) set.add(propertyId);
  else set.delete(propertyId);
  return [...set];
}
