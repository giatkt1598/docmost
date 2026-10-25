import { buildPageUrl } from "@/features/page/page.utils";
import {
  RefPage,
  RefUser,
  RowReferenceMap,
} from "@/features/base/types/base.types";

// Person and page cells hold ids; the rows response resolves them in
// `references`. Unknown ids (no access, deleted) resolve to null.

export const EMPTY_REFERENCES: RowReferenceMap = { users: {}, pages: {} };

export function asIdList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return list.filter((v): v is string => typeof v === "string" && v !== "");
}

export function referencedUser(
  refs: RowReferenceMap | null | undefined,
  id: string | null | undefined,
): RefUser | null {
  if (!id) return null;
  return refs?.users?.[id] ?? null;
}

export function userDisplayName(
  refs: RowReferenceMap | null | undefined,
  id: string | null | undefined,
  fallback = "",
): string {
  return referencedUser(refs, id)?.name?.trim() || fallback;
}

export function referencedPage(
  refs: RowReferenceMap | null | undefined,
  id: string | null | undefined,
): RefPage | null {
  if (!id) return null;
  return refs?.pages?.[id] ?? null;
}

export function pageDisplayTitle(
  refs: RowReferenceMap | null | undefined,
  id: string | null | undefined,
  untitled = "Untitled",
): string | null {
  const page = referencedPage(refs, id);
  if (!page) return null;
  return page.title?.trim() || untitled;
}

// Link to a referenced page, or null when it is not accessible.
export function referencedPageUrl(
  refs: RowReferenceMap | null | undefined,
  id: string | null | undefined,
): string | null {
  const page = referencedPage(refs, id);
  if (!page?.space?.slug) return null;
  return buildPageUrl(page.space.slug, page.slugId, page.title ?? undefined);
}

export function withReferences(
  base: RowReferenceMap,
  extra: Partial<RowReferenceMap> | null | undefined,
): RowReferenceMap {
  if (!extra) return base;
  return {
    users: { ...base.users, ...extra.users },
    pages: { ...base.pages, ...extra.pages },
  };
}
