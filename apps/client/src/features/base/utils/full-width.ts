// "Full width" display preference of a base, and the geometry of breaking an
// embedded base out of the editor's text column.

// ---- preference storage -------------------------------------------------------

export const FULL_WIDTH_EVENT = "docmost:base-full-width";

export const fullWidthKey = (pageId: string) => `docmost.base.fullWidth:${pageId}`;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readFullWidth(pageId: string, store: StorageLike | null = defaultStorage()): boolean {
  try {
    return store?.getItem(fullWidthKey(pageId)) === "1";
  } catch {
    return false;
  }
}

export function writeFullWidth(
  pageId: string,
  value: boolean,
  store: StorageLike | null = defaultStorage(),
): void {
  try {
    if (value) store?.setItem(fullWidthKey(pageId), "1");
    else store?.removeItem(fullWidthKey(pageId));
  } catch {
    // storage blocked or full: the switch then only lasts until reload
  }
}

// ---- geometry -----------------------------------------------------------------

export type Bounds = { left: number; right: number; width: number };

type RectLike = { left: number; right: number };
type Paddings = { left: number; right: number };

// The area pages are laid out in: the content box of the app shell's main
// element. The shell reserves the sidebar and the aside through the padding
// of main (plus its own page padding), so the raw rect of main, which runs
// under both, is not usable.
export function contentBounds(main: RectLike, padding: Paddings): Bounds {
  const left = main.left + padding.left;
  const right = main.right - padding.right;
  return { left, right, width: Math.max(0, right - left) };
}

export function paddingsOf(style: Pick<CSSStyleDeclaration, "paddingLeft" | "paddingRight">): Paddings {
  return {
    left: parseFloat(style.paddingLeft) || 0,
    right: parseFloat(style.paddingRight) || 0,
  };
}

export const BREAKOUT_MARGIN = 8;

export type BreakoutBox = { marginLeft: number; width: number };

// Left margin and width that make a block, whose natural left edge is
// `naturalLeft`, span the bounds minus a small side margin.
export function breakoutBox(
  naturalLeft: number,
  bounds: Bounds,
  margin = BREAKOUT_MARGIN,
): BreakoutBox {
  const width = Math.max(0, bounds.width - 2 * margin);
  return { marginLeft: Math.round(bounds.left + margin - naturalLeft), width: Math.round(width) };
}

export function sameBox(a: BreakoutBox | null, b: BreakoutBox | null): boolean {
  if (a === b) return true;
  return !!a && !!b && a.marginLeft === b.marginLeft && a.width === b.width;
}
