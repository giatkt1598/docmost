import api from "@/lib/api-client";

// Password protection of a page. The server keeps the unlock in an httpOnly
// cookie, so these calls only need the page id.

export const PAGE_PASSWORD_REQUIRED = "PAGE_PASSWORD_REQUIRED";
export const PAGE_PASSWORD_INVALID = "PAGE_PASSWORD_INVALID";

export interface LockedPageInfo {
  id: string;
  title: string | null;
  icon: string | null;
}

// The page behind a "password required" error, or null for other errors.
export function lockedPageFromError(error: unknown): LockedPageInfo | null {
  const data = (error as any)?.response?.data;
  if ((error as any)?.response?.status !== 403) return null;
  if (data?.code !== PAGE_PASSWORD_REQUIRED) return null;
  return data.page ?? null;
}

export function isInvalidPasswordError(error: unknown): boolean {
  return (error as any)?.response?.data?.code === PAGE_PASSWORD_INVALID;
}

export async function unlockPage(pageId: string, password: string) {
  await api.post("/pages/unlock", { pageId, password });
}

export async function setPagePassword(pageId: string, password: string) {
  await api.post("/pages/password/set", { pageId, password });
}

export async function removePagePassword(pageId: string) {
  await api.post("/pages/password/remove", { pageId });
}

// The token the collaboration socket sends: it carries no cookies, so a
// protected page's unlock rides along with the collab token.
export function collabTokenFor(
  collabToken: string | undefined,
  unlockToken: string | undefined,
): string | undefined {
  if (!collabToken) return collabToken;
  return unlockToken ? `${collabToken}|${unlockToken}` : collabToken;
}
