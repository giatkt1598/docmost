import { RefObject, useEffect, useState } from "react";
import {
  BreakoutBox,
  breakoutBox,
  contentBounds,
  paddingsOf,
  sameBox,
} from "@/features/base/utils/full-width";

// Box that makes an element inside the editor's text column span the whole
// content area of the page (between the sidebar and the window or aside
// edge). `anchor` is the element in its natural place (the text column),
// whose left edge is the reference. Returns null while disabled, so nothing
// is stretched unless asked for.
//
// Measured against the content box of the app shell's <main>: the shell
// reserves the sidebar / aside width as padding of main, which changes when
// the sidebar is collapsed or resized or the aside opens without main's own
// size changing, hence the content-box observation (plus window resize).
export function useBreakout(anchor: RefObject<HTMLElement | null>, enabled: boolean): BreakoutBox | null {
  const [box, setBox] = useState<BreakoutBox | null>(null);

  useEffect(() => {
    const el = anchor.current;
    if (!enabled || !el) {
      setBox(null);
      return;
    }
    const main = el.closest("main") as HTMLElement | null;
    const measure = () => {
      const bounds = main
        ? contentBounds(main.getBoundingClientRect(), paddingsOf(getComputedStyle(main)))
        : { left: 0, right: window.innerWidth, width: window.innerWidth };
      const next = breakoutBox(el.getBoundingClientRect().left, bounds);
      setBox((prev) => (sameBox(prev, next) ? prev : next));
    };
    measure();

    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (main) ro?.observe(main, { box: "content-box" });
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchor, enabled]);

  return enabled ? box : null;
}
