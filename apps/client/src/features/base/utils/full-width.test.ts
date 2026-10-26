import { describe, expect, it } from "vitest";
import {
  BREAKOUT_MARGIN,
  breakoutBox,
  contentBounds,
  paddingsOf,
  pickActiveView,
  sameBox,
  viewFullWidth,
} from "./full-width";

describe("content bounds of the app shell", () => {
  it("takes the content box of main: the sidebar and aside live in its padding", () => {
    // window 1400 wide, sidebar 300 + page padding 16, aside 350 + 16
    const main = { left: 0, right: 1400 };
    expect(contentBounds(main, { left: 316, right: 366 })).toEqual({ left: 316, right: 1034, width: 718 });
    // sidebar collapsed, aside closed
    expect(contentBounds(main, { left: 16, right: 16 })).toEqual({ left: 16, right: 1384, width: 1368 });
  });

  it("offsets by the left of main and never goes negative", () => {
    expect(contentBounds({ left: 100, right: 500 }, { left: 20, right: 20 })).toEqual({
      left: 120,
      right: 480,
      width: 360,
    });
    expect(contentBounds({ left: 0, right: 100 }, { left: 80, right: 80 }).width).toBe(0);
  });

  it("reads paddings from computed styles", () => {
    expect(paddingsOf({ paddingLeft: "316px", paddingRight: "16.5px" })).toEqual({ left: 316, right: 16.5 });
    expect(paddingsOf({ paddingLeft: "", paddingRight: "auto" })).toEqual({ left: 0, right: 0 });
  });
});

describe("breakout box", () => {
  const bounds = { left: 316, right: 1034, width: 718 };

  it("spans the bounds minus a small side margin", () => {
    // text column starts at 400 (centered 900px column): pull left by 76
    expect(breakoutBox(400, bounds)).toEqual({
      marginLeft: 316 + BREAKOUT_MARGIN - 400,
      width: 718 - 2 * BREAKOUT_MARGIN,
    });
  });

  it("starts at the left bound when the column already begins there", () => {
    expect(breakoutBox(316, bounds, 0)).toEqual({ marginLeft: 0, width: 718 });
  });

  it("never gets a negative width", () => {
    expect(breakoutBox(0, { left: 0, right: 10, width: 10 }, 8).width).toBe(0);
  });

  it("compares boxes", () => {
    expect(sameBox({ marginLeft: 1, width: 2 }, { marginLeft: 1, width: 2 })).toBe(true);
    expect(sameBox({ marginLeft: 1, width: 2 }, { marginLeft: 1, width: 3 })).toBe(false);
    expect(sameBox(null, null)).toBe(true);
    expect(sameBox(null, { marginLeft: 0, width: 0 })).toBe(false);
  });
});

describe("the view's full width setting", () => {
  const views = [{ id: "a", config: { fullWidth: true } }, { id: "b", config: {} }];

  it("picks the wanted view, else the first", () => {
    expect(pickActiveView(views, "b")?.id).toBe("b");
    expect(pickActiveView(views, "zzz")?.id).toBe("a");
    expect(pickActiveView(views, null)?.id).toBe("a");
    expect(pickActiveView([], "a")).toBeNull();
  });

  it("is on only for an explicit true", () => {
    expect(viewFullWidth(views[0])).toBe(true);
    expect(viewFullWidth(views[1])).toBe(false);
    expect(viewFullWidth({ config: { fullWidth: false } })).toBe(false);
    expect(viewFullWidth(null)).toBe(false);
    expect(viewFullWidth({})).toBe(false);
  });
});
