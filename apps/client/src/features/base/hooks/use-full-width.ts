import { useCallback, useSyncExternalStore } from "react";
import {
  FULL_WIDTH_EVENT,
  fullWidthKey,
  readFullWidth,
  writeFullWidth,
} from "@/features/base/utils/full-width";

function subscribe(onChange: () => void) {
  // same window: the custom event; other tabs: the storage event
  window.addEventListener(FULL_WIDTH_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(FULL_WIDTH_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Per user, per base display preference kept in localStorage. Every
// component using it (the page, an embed, the toolbar switch) stays in sync.
export function useFullWidth(pageId: string | undefined): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (pageId ? readFullWidth(pageId) : false),
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      if (!pageId) return;
      writeFullWidth(pageId, next);
      window.dispatchEvent(new CustomEvent(FULL_WIDTH_EVENT, { detail: fullWidthKey(pageId) }));
    },
    [pageId],
  );
  return [value, set];
}
