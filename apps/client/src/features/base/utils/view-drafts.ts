import { RowFilter, SortRule } from "@/features/base/types/base.types";

// Filter and sort changes stay a personal draft of the viewer until someone
// with edit rights saves them for everyone. Drafts live in localStorage,
// per user and per view.

export type ViewDraft = { filter?: RowFilter | null; sorts?: SortRule[] | null };

const PREFIX = "docmost.base.draft";

export const draftKey = (userId: string | null | undefined, viewId: string) =>
  `${PREFIX}:${userId ?? "anon"}:${viewId}`;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readDraft(key: string, store = storage()): ViewDraft | null {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ViewDraft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(
  key: string,
  draft: ViewDraft | null,
  store = storage(),
): void {
  try {
    if (!draft || (draft.filter === undefined && draft.sorts === undefined)) {
      store?.removeItem(key);
    } else {
      store?.setItem(key, JSON.stringify(draft));
    }
  } catch {
    // storage full or blocked: the draft only lives in memory then
  }
}

// Stable JSON for comparisons (object keys sorted).
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const normFilter = (f: RowFilter | null | undefined) =>
  f && f.children.length ? f : null;
const normSorts = (s: SortRule[] | null | undefined) => (s && s.length ? s : null);

// What the view shows: the draft where it has a value, the saved config
// otherwise.
export function effectiveQuery(
  saved: { filter?: RowFilter; sorts?: SortRule[] },
  draft: ViewDraft | null,
): { filter: RowFilter | null; sorts: SortRule[] | null } {
  return {
    filter: normFilter(draft && "filter" in draft ? draft.filter : saved.filter),
    sorts: normSorts(draft && "sorts" in draft ? draft.sorts : saved.sorts),
  };
}

// True when the draft would change what the saved view shows.
export function draftDiffers(
  saved: { filter?: RowFilter; sorts?: SortRule[] },
  draft: ViewDraft | null,
): boolean {
  if (!draft) return false;
  const eff = effectiveQuery(saved, draft);
  return (
    stableStringify(eff.filter) !== stableStringify(normFilter(saved.filter)) ||
    stableStringify(eff.sorts) !== stableStringify(normSorts(saved.sorts))
  );
}

// The views/update config patch that saves a draft (null removes a key).
export function draftToConfigPatch(
  saved: { filter?: RowFilter; sorts?: SortRule[] },
  draft: ViewDraft,
): { filter?: RowFilter | null; sorts?: SortRule[] | null } {
  const eff = effectiveQuery(saved, draft);
  return { filter: eff.filter, sorts: eff.sorts };
}
