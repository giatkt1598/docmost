import { atom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { RefPage, RefUser, RowReferenceMap } from "@/features/base/types/base.types";

// Users and pages picked in this session. The rows response resolves
// references only on the next fetch; until then cells read names from here.
export const pickedReferencesAtom = atom<RowReferenceMap>({ users: {}, pages: {} });

export function useRememberReferences() {
  const set = useSetAtom(pickedReferencesAtom);
  return useCallback(
    (extra: { users?: RefUser[]; pages?: RefPage[] }) =>
      set((prev) => ({
        users: {
          ...prev.users,
          ...Object.fromEntries((extra.users ?? []).map((u) => [u.id, u])),
        },
        pages: {
          ...prev.pages,
          ...Object.fromEntries((extra.pages ?? []).map((p) => [p.id, p])),
        },
      })),
    [set],
  );
}
