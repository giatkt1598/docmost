import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  BREAKOUT_MARGIN,
  breakoutBox,
  contentBounds,
  fullWidthKey,
  paddingsOf,
  readFullWidth,
  sameBox,
  writeFullWidth,
} from "./full-width";
import { useFullWidth } from "@/features/base/hooks/use-full-width";

function fakeStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

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

describe("full width preference storage", () => {
  it("is per base and off by default", () => {
    const store = fakeStore();
    expect(readFullWidth("a", store)).toBe(false);
    writeFullWidth("a", true, store);
    expect(readFullWidth("a", store)).toBe(true);
    expect(readFullWidth("b", store)).toBe(false);
    expect(store.data.has(fullWidthKey("a"))).toBe(true);
    writeFullWidth("a", false, store);
    expect(store.data.size).toBe(0);
  });

  it("survives a storage that throws or is missing", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readFullWidth("a", broken)).toBe(false);
    expect(() => writeFullWidth("a", true, broken)).not.toThrow();
    expect(readFullWidth("a", null)).toBe(false);
    expect(() => writeFullWidth("a", true, null)).not.toThrow();
  });
});

describe("useFullWidth", () => {
  afterEach(() => window.localStorage.clear());

  it("reads, writes and keeps every user of the same base in sync", () => {
    const first = renderHook(() => useFullWidth("base-1"));
    const second = renderHook(() => useFullWidth("base-1"));
    const other = renderHook(() => useFullWidth("base-2"));
    expect(first.result.current[0]).toBe(false);

    act(() => first.result.current[1](true));
    expect(first.result.current[0]).toBe(true);
    expect(second.result.current[0]).toBe(true);
    expect(other.result.current[0]).toBe(false);
    expect(window.localStorage.getItem(fullWidthKey("base-1"))).toBe("1");

    act(() => second.result.current[1](false));
    expect(first.result.current[0]).toBe(false);
    expect(window.localStorage.getItem(fullWidthKey("base-1"))).toBeNull();
  });

  it("follows changes made in another tab", () => {
    const { result } = renderHook(() => useFullWidth("base-3"));
    act(() => {
      window.localStorage.setItem(fullWidthKey("base-3"), "1");
      window.dispatchEvent(new StorageEvent("storage", { key: fullWidthKey("base-3") }));
    });
    expect(result.current[0]).toBe(true);
  });

  it("does nothing without a page id", () => {
    const { result } = renderHook(() => useFullWidth(undefined));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });
});
