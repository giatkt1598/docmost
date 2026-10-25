import { BaseProperty, SortRule } from "@/features/base/types/base.types";
import { isPropertySortable } from "@/features/base/registry/property-types";

export const MAX_SORT_RULES = 10;

export function addSortRule(rules: SortRule[], propertyId: string): SortRule[] {
  if (rules.length >= MAX_SORT_RULES || rules.some((r) => r.propertyId === propertyId)) {
    return rules;
  }
  return [...rules, { propertyId, direction: "asc" }];
}

export function moveSortRule(rules: SortRule[], index: number, delta: -1 | 1): SortRule[] {
  const to = index + delta;
  if (to < 0 || to >= rules.length) return rules;
  const out = [...rules];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

// Rules as sent to the server: known, sortable properties, once each.
export function pruneSorts(
  rules: SortRule[] | null | undefined,
  properties: Pick<BaseProperty, "id" | "type" | "typeOptions">[],
): SortRule[] | undefined {
  if (!rules?.length) return undefined;
  const byId = new Map(properties.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out = rules.filter((r) => {
    const p = byId.get(r.propertyId);
    if (!p || !isPropertySortable(p) || seen.has(r.propertyId)) return false;
    seen.add(r.propertyId);
    return true;
  });
  return out.length ? out.slice(0, MAX_SORT_RULES) : undefined;
}
