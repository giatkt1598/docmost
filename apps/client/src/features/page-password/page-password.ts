import api from "@/lib/api-client";
import { getDefaultStore } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";

// Password protection of a page. The server keeps each unlock in an
// httpOnly cookie, so these calls only need the page id.

export const PAGE_PASSWORD_REQUIRED = "PAGE_PASSWORD_REQUIRED";
export const PAGE_PASSWORD_INVALID = "PAGE_PASSWORD_INVALID";

export interface LockedPageInfo {
  // the page whose password unlocks: the page itself, or an ancestor whose
  // password covers its sub-pages
  id: string;
  title: string | null;
  icon: string | null;
  // the page that was asked for, when it differs
  requestedPage?: { id: string; title: string | null; icon: string | null };
}

// The page behind a "password required" error, or null for other errors.
export function lockedPageFromError(error: unknown): LockedPageInfo | null {
  const response = (error as any)?.response;
  if (response?.status !== 403) return null;
  const data = response.data;
  if (data?.code !== PAGE_PASSWORD_REQUIRED || !data.page) return null;
  const requested = data.requestedPage;
  return {
    ...data.page,
    ...(requested && requested.id !== data.page.id && {
      requestedPage: requested,
    }),
  };
}

export function isInvalidPasswordError(error: unknown): boolean {
  return (error as any)?.response?.data?.code === PAGE_PASSWORD_INVALID;
}

export async function unlockPage(pageId: string, password: string) {
  await api.post("/pages/unlock", { pageId, password });
  markTreeUnlocked(pageId);
}

export async function setPagePassword(
  pageId: string,
  opts: { password?: string; includeSubPages?: boolean },
) {
  await api.post("/pages/password/set", { pageId, ...opts });
}

export async function removePagePassword(pageId: string) {
  await api.post("/pages/password/remove", { pageId });
}

// The token the collaboration socket sends: it carries no cookies, so the
// unlocks of a protected page ride along with the collab token.
export function collabTokenFor(
  collabToken: string | undefined,
  unlockTokens: string[] | undefined,
): string | undefined {
  if (!collabToken || !unlockTokens?.length) return collabToken;
  return [collabToken, ...unlockTokens].join("|");
}

// Shows the lock open on an unlocked page and on its loaded sub-pages in
// the sidebar. A sub-page with a password of its own may still be locked;
// the server corrects that on the next load of the tree.
function markTreeUnlocked(pageId: string) {
  const store = getDefaultStore();
  const openAll = (node: SpaceTreeNode): SpaceTreeNode => ({
    ...node,
    ...(node.hasPassword && { passwordUnlocked: true }),
    children: node.children?.map(openAll) ?? [],
  });
  const walk = (nodes: SpaceTreeNode[]): SpaceTreeNode[] =>
    nodes.map((node) =>
      node.id === pageId
        ? openAll(node)
        : { ...node, children: node.children ? walk(node.children) : [] },
    );
  store.set(treeDataAtom, walk(store.get(treeDataAtom)));
}
