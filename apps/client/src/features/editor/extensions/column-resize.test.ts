import { describe, expect, it } from "vitest";
import {
  resizeAdjacentColumns,
  scaleColumns,
  stripWidthFromStyle,
} from "../../../../../../packages/editor-ext/src/lib/table/utils/column-resize";

describe("resizeAdjacentColumns", () => {
  it("moves width between the two neighbours and keeps the sum", () => {
    expect(resizeAdjacentColumns([100, 200, 300], 0, 50, 49)).toEqual([150, 150, 300]);
  });

  it("clamps to the minimum width", () => {
    expect(resizeAdjacentColumns([100, 200, 300], 0, 500, 49)).toEqual([251, 49, 300]);
    expect(resizeAdjacentColumns([100, 200, 300], 1, -500, 49)).toEqual([100, 49, 451]);
  });
});

describe("scaleColumns", () => {
  it("scales every column proportionally", () => {
    expect(scaleColumns([100, 200, 300], 600, 49)).toEqual([200, 400, 600]);
  });

  it("keeps the exact target total despite rounding", () => {
    const next = scaleColumns([101, 101, 101], 100, 49);
    expect(next.reduce((a, b) => a + b, 0)).toBe(403);
  });

  it("never shrinks below min width per column", () => {
    expect(scaleColumns([100, 100], -1000, 49)).toEqual([49, 49]);
  });
});

describe("stripWidthFromStyle", () => {
  it("removes width but keeps min-width", () => {
    expect(stripWidthFromStyle("width: 500px; min-width: 100px")).toBe("min-width: 100px");
  });
});
