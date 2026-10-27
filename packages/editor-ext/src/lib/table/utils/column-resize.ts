export type TableEdge = "left" | "right";

/**
 * Drag the boundary between column `col` and `col + 1`: only those two
 * columns change and their sum is preserved.
 */
export function resizeAdjacentColumns(
  widths: number[],
  col: number,
  dx: number,
  minWidth: number,
): number[] {
  const next = widths.slice();
  const pair = widths[col] + widths[col + 1];
  const left = Math.round(
    Math.min(Math.max(widths[col] + dx, minWidth), Math.max(pair - minWidth, minWidth)),
  );
  next[col] = left;
  next[col + 1] = pair - left;
  return next;
}

/**
 * Drag the table's outer edge by `growth` px (positive = wider): every
 * column is scaled proportionally, so the whole table grows or shrinks.
 */
export function scaleColumns(
  widths: number[],
  growth: number,
  minWidth: number,
): number[] {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (!total) return widths.slice();

  const target = Math.round(Math.max(total + growth, minWidth * widths.length));
  const scale = target / total;
  const next = widths.map((w) => Math.max(minWidth, Math.round(w * scale)));

  // Rounding / min clamping drift lands on the widest column.
  const drift = target - next.reduce((sum, w) => sum + w, 0);
  if (drift) {
    const widest = next.indexOf(Math.max(...next));
    next[widest] = Math.max(minWidth, next[widest] + drift);
  }
  return next;
}

/** Remove any `width` declaration (not min-/max-width) from an inline style. */
export function stripWidthFromStyle(style: string): string {
  return style
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl && !/^width\s*:/i.test(decl))
    .join("; ");
}
