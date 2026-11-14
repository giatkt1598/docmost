import api from "@/lib/api-client";
import { getDefaultStore } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { queryClient } from "@/main.tsx";
import { fetchAllAncestorChildren } from "@/features/page/queries/page-query.ts";

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
  // a locked page hides its sub-pages: show them, then the real lock of
  // each (a sub-page with a password of its own stays locked)
  void revealSubPages(pageId).then(() => refreshTreeLockState(pageId));
  queryClient.invalidateQueries({ queryKey: ["shared-page-tree"] });
  queryClient.invalidateQueries({ queryKey: ["public-space-tree"] });
}

// Loads the sub-pages the sidebar hid while the page was locked.
async function revealSubPages(pageId: string) {
  const store = getDefaultStore();
  const node = treeModel.find(store.get(treeDataAtom), pageId);
  if (!node) return;
  const params = { pageId, spaceId: node.spaceId };
  queryClient.removeQueries({ queryKey: ["sidebar-pages", params] });
  try {
    const children = await fetchAllAncestorChildren(params);
    if (children.length === 0) return;
    store.set(treeDataAtom, (prev) =>
      treeModel.update(
        treeModel.appendChildren(prev, pageId, children),
        pageId,
        { hasChildren: true } as Partial<SpaceTreeNode>,
      ),
    );
  } catch {
    // the tree loads them on the next visit
  }
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

// Asks the server for the lock of a page and its loaded sub-pages in the
// sidebar, and shows each lock closed, open, or gone.
export async function refreshTreeLockState(pageId: string) {
  const store = getDefaultStore();
  const node = treeModel.find(store.get(treeDataAtom), pageId);
  if (!node) return;
  const ids: string[] = [];
  const collect = (n: SpaceTreeNode) => {
    ids.push(n.id);
    n.children?.forEach(collect);
  };
  collect(node);
  let state: Record<string, boolean>;
  try {
    const res = await api.post<Record<string, boolean>>(
      "/pages/password/lock-state",
      { pageIds: ids.slice(0, 500) },
    );
    state = res.data ?? {};
  } catch {
    return;
  }
  const known = new Set(ids);
  const apply = (n: SpaceTreeNode): SpaceTreeNode => ({
    ...n,
    ...(known.has(n.id) && {
      hasPassword: n.id in state,
      passwordUnlocked: state[n.id] === true,
    }),
    children: n.children?.map(apply) ?? [],
  });
  const walk = (nodes: SpaceTreeNode[]): SpaceTreeNode[] =>
    nodes.map((n) =>
      n.id === pageId
        ? apply(n)
        : { ...n, children: n.children ? walk(n.children) : [] },
    );
  store.set(treeDataAtom, walk(store.get(treeDataAtom)));
}
