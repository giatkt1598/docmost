import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';

const STATE_TTL_MS = 10 * 60 * 1000;

export type SsoState = {
  providerId: string;
  redirect: string;
  // origin the login started from, when it differs from the callback's
  origin?: string;
  state?: string;
  nonce?: string;
  codeVerifier?: string;
  expiresAt: number;
};

// Encrypted, short-lived round-trip state for an SSO login attempt.
export function sealSsoState(
  encryption: EncryptionService,
  state: Omit<SsoState, 'expiresAt'>,
): string {
  return encryption.encrypt(
    JSON.stringify({ ...state, expiresAt: Date.now() + STATE_TTL_MS }),
    EncryptionPurpose.SSO_STATE,
  );
}

export function openSsoState(
  encryption: EncryptionService,
  sealed: string | undefined,
  providerId: string,
): SsoState | null {
  if (!sealed) return null;
  try {
    const state = JSON.parse(
      encryption.decrypt(sealed, EncryptionPurpose.SSO_STATE),
    ) as SsoState;
    if (state.providerId !== providerId || state.expiresAt < Date.now()) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

// The origin a login was started from, if it is one we may send the user
// back to: the app URL, or any localhost port in development (the Vite dev
// server proxies /api with its own Host header).
export function trustedReturnOrigin(
  requestOrigin: string,
  appUrl: string,
  allowLocalhost: boolean,
): string | undefined {
  let origin: URL;
  try {
    origin = new URL(requestOrigin);
  } catch {
    return undefined;
  }
  if (origin.origin === new URL(appUrl).origin) return origin.origin;
  if (
    allowLocalhost &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  ) {
    return origin.origin;
  }
  return undefined;
}

// Only same-origin paths are allowed as post-login destinations.
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string') return '/home';
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return '/home';
  }
  return value;
}
