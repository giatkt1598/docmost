// Row selection of the table: click toggles, shift-click selects the range
// from the last clicked row (the anchor) in display order.

export type RowSelection = { ids: Set<string>; anchor: string | null };

export const emptySelection = (): RowSelection => ({ ids: new Set(), anchor: null });

export function toggleRow(sel: RowSelection, id: string): RowSelection {
  const ids = new Set(sel.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ids, anchor: id };
}

export function selectRange(
  sel: RowSelection,
  id: string,
  order: string[],
): RowSelection {
  const anchorIdx = sel.anchor ? order.indexOf(sel.anchor) : -1;
  const idx = order.indexOf(id);
  if (anchorIdx < 0 || idx < 0) return toggleRow(sel, id);
  const [from, to] = anchorIdx <= idx ? [anchorIdx, idx] : [idx, anchorIdx];
  const ids = new Set(sel.ids);
  for (let i = from; i <= to; i++) ids.add(order[i]);
  // the anchor stays, so the next shift-click extends from the same row
  return { ids, anchor: sel.anchor };
}

export function clickRow(
  sel: RowSelection,
  id: string,
  order: string[],
  shiftKey: boolean,
): RowSelection {
  return shiftKey ? selectRange(sel, id, order) : toggleRow(sel, id);
}

export function selectAll(order: string[]): RowSelection {
  return { ids: new Set(order), anchor: order[0] ?? null };
}

// Drops ids that are no longer listed (deleted rows, refetches).
export function pruneSelection(sel: RowSelection, order: string[]): RowSelection {
  const present = new Set(order);
  let changed = false;
  const ids = new Set<string>();
  for (const id of sel.ids) {
    if (present.has(id)) ids.add(id);
    else changed = true;
  }
  const anchor = sel.anchor && present.has(sel.anchor) ? sel.anchor : null;
  if (!changed && anchor === sel.anchor) return sel;
  return { ids, anchor };
}

export type SelectAllState = "none" | "some" | "all";

export function selectAllState(sel: RowSelection, order: string[]): SelectAllState {
  if (sel.ids.size === 0 || order.length === 0) return "none";
  const all = order.every((id) => sel.ids.has(id));
  return all ? "all" : "some";
}
