import {
  BaseProperty,
  BaseRow,
  ChoiceOptions,
  DateOptions,
  FormulaOptions,
  PropertyOptions,
  PropertyType,
} from "@/features/base/types/base.types";
import { PROPERTY_TYPES } from "@/features/base/registry/property-types";
import { CHOICE_PALETTE } from "@/features/base/types/base.types";
import { newChoiceId } from "@/features/base/utils/cell-values";
import { orderProperties } from "@/features/base/utils/grid-columns";
import { cleanDateOptions } from "@/features/base/utils/options-preview";

const CHOICE_TYPES = new Set(["select", "status", "multiSelect"]);
const MAX_CHOICES = 500;

// typeOptions to send with a type change. The server maps values to the
// target choices by name, so converting to a choice type needs the choices:
// copied from a choice type, or collected from the loaded values otherwise.
export function conversionOptions(
  from: Pick<BaseProperty, "id" | "type" | "typeOptions">,
  to: PropertyType,
  rows: Pick<BaseRow, "cells">[],
): PropertyOptions {
  const defaults = PROPERTY_TYPES[to].defaultTypeOptions();
  if (!CHOICE_TYPES.has(to)) return defaults;

  let names: string[];
  if (CHOICE_TYPES.has(from.type)) {
    const opts = from.typeOptions as ChoiceOptions | null;
    const choices = (opts?.choices ?? []).map((c) => {
      const { category, ...rest } = c;
      return to === "status" ? { ...rest, category: category ?? "todo" } : rest;
    });
    return { choices, choiceOrder: opts?.choiceOrder ?? choices.map((c) => c.id) };
  } else {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const raw = row.cells?.[from.id];
      if (typeof raw !== "string" && typeof raw !== "number") continue;
      const parts = to === "multiSelect" ? String(raw).split(",") : [String(raw)];
      for (const part of parts) {
        const name = part.trim().slice(0, 200);
        if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
        if (seen.size >= MAX_CHOICES) break;
      }
    }
    names = [...seen.values()];
  }
  const choices = names.map((name, i) => ({
    id: newChoiceId(),
    name,
    color: CHOICE_PALETTE[(i % (CHOICE_PALETTE.length - 1)) + 1],
    ...(to === "status" ? { category: "todo" as const } : {}),
  }));
  return { choices, choiceOrder: choices.map((c) => c.id) };
}

// propertyOrder after inserting `newId` left or right of `anchorId`.
export function orderWithInserted(
  properties: BaseProperty[],
  propertyOrder: string[] | undefined,
  anchorId: string,
  side: "left" | "right",
  newId: string,
): string[] {
  const ids = orderProperties(properties, propertyOrder)
    .filter((p) => !p.isPrimary && p.id !== newId)
    .map((p) => p.id);
  const anchorIdx = ids.indexOf(anchorId);
  // left of the primary is not possible: it stays first
  const at = anchorIdx < 0 ? 0 : anchorIdx + (side === "right" ? 1 : 0);
  ids.splice(at, 0, newId);
  return ids;
}

// Previous / next row around `rowId` in a list.
export function rowNeighbours(order: string[], rowId: string) {
  const index = order.indexOf(rowId);
  return {
    index,
    total: order.length,
    prev: index > 0 ? order[index - 1] : null,
    next: index >= 0 && index < order.length - 1 ? order[index + 1] : null,
  };
}

export const DATE_TYPES = new Set(["date", "createdAt", "lastEditedAt"]);

// The typeOptions the server receives for a property type.
export function optionsToSave(type: string, draft: PropertyOptions): PropertyOptions {
  if (DATE_TYPES.has(type)) return cleanDateOptions(draft as DateOptions);
  if (type === "formula") {
    const f = draft as FormulaOptions;
    // the server compiles the source; the rest is recomputed
    return { source: f.source ?? "", ...(f.formatOptions ? { formatOptions: f.formatOptions } : {}) };
  }
  return draft;
}

