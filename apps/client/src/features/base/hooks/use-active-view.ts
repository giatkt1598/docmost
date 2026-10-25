import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BaseView } from "@/features/base/types/base.types";

export const VIEW_PARAM = "view";

// The view on screen. The standalone base page keeps it in `?view=` so the
// link can be shared; embeds keep it in local state (several embeds on one
// page would fight over the URL).
export function useActiveView(views: BaseView[], embedded: boolean) {
  const [params, setParams] = useSearchParams();
  const [localId, setLocalId] = useState<string | null>(null);
  const wanted = embedded ? localId : params.get(VIEW_PARAM);
  const active = views.find((v) => v.id === wanted) ?? views[0] ?? null;

  const select = useCallback(
    (viewId: string) => {
      if (embedded) {
        setLocalId(viewId);
        return;
      }
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(VIEW_PARAM, viewId);
          return next;
        },
        { replace: true },
      );
    },
    [embedded, setParams],
  );

  return [active, select] as const;
}

// Opens the row detail (`?row=&rowBase=`); the modal reads these params.
export function useOpenRow(pageId: string) {
  const [, setParams] = useSearchParams();
  return useCallback(
    (rowId: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("row", rowId);
        next.set("rowBase", pageId);
        return next;
      }),
    [pageId, setParams],
  );
}
