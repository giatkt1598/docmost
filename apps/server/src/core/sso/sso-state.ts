import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';

const STATE_TTL_MS = 10 * 60 * 1000;

export type SsoState = {
  providerId: string;
  redirect: string;
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
