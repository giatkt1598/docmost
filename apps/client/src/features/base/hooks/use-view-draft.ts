import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import { BaseView, RowFilter, SortRule } from "@/features/base/types/base.types";
import {
  draftDiffers,
  draftKey,
  draftToConfigPatch,
  effectiveQuery,
  readDraft,
  ViewDraft,
  writeDraft,
} from "@/features/base/utils/view-drafts";

// Personal filter / sort draft of a view, kept in localStorage.
export function useViewDraft(view: BaseView | null) {
  const user = useAtomValue(userAtom);
  const key = view ? draftKey(user?.id, view.id) : null;
  const [draft, setDraft] = useState<ViewDraft | null>(() => (key ? readDraft(key) : null));

  // another view (or user): load its draft
  useEffect(() => {
    setDraft(key ? readDraft(key) : null);
  }, [key]);

  const saved = useMemo(
    () => ({ filter: view?.config?.filter, sorts: view?.config?.sorts }),
    [view?.config?.filter, view?.config?.sorts],
  );

  const update = useCallback(
    (patch: ViewDraft) => {
      if (!key) return;
      setDraft((prev) => {
        const next = { ...(prev ?? {}), ...patch };
        // a draft equal to the saved view is no draft
        const keep = draftDiffers(saved, next) ? next : null;
        writeDraft(key, keep);
        return keep;
      });
    },
    [key, saved],
  );

  const reset = useCallback(() => {
    if (key) writeDraft(key, null);
    setDraft(null);
  }, [key]);

  const effective = useMemo(() => effectiveQuery(saved, draft), [saved, draft]);

  return {
    filter: effective.filter,
    sorts: effective.sorts,
    setFilter: (filter: RowFilter | null) => update({ filter }),
    setSorts: (sorts: SortRule[] | null) => update({ sorts }),
    hasDraft: draftDiffers(saved, draft),
    // config patch for "Save for everyone"
    savePatch: () => (draft ? draftToConfigPatch(saved, draft) : null),
    reset,
  };
}
