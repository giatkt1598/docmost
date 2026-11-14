// Page password protection: shared names for the unlock cookie and errors.

// One cookie per unlocked page: `pu_<pageId>` holding a PAGE_UNLOCK JWT.
export const PAGE_UNLOCK_COOKIE_PREFIX = 'pu_';

// How long an unlock lasts. Changing or removing the password ends it early.
export const PAGE_UNLOCK_TTL = '8h';
export const PAGE_UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

// CLS key holding the unlock tokens the current request carries.
export const PAGE_UNLOCK_CLS_KEY = 'pageUnlockTokens';

export const PAGE_PASSWORD_REQUIRED = 'PAGE_PASSWORD_REQUIRED';
export const PAGE_PASSWORD_INVALID = 'PAGE_PASSWORD_INVALID';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pageUnlockCookieName(pageId: string): string {
  return `${PAGE_UNLOCK_COOKIE_PREFIX}${pageId}`;
}

// The unlock tokens in a Cookie header, by page id.
export function readUnlockCookies(
  header: string | undefined,
): Record<string, string> {
  const tokens: Record<string, string> = {};
  if (!header) return tokens;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name.startsWith(PAGE_UNLOCK_COOKIE_PREFIX)) continue;
    const pageId = name.slice(PAGE_UNLOCK_COOKIE_PREFIX.length);
    if (!UUID.test(pageId)) continue;
    const value = part.slice(eq + 1).trim();
    if (value) tokens[pageId] = decodeURIComponent(value);
  }
  return tokens;
}
