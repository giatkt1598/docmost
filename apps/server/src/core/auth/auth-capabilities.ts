// Which login protections this build can actually enforce. Workspace settings
// that rely on them (enforce MFA / enforce SSO) must be rejected otherwise:
// without an implementation they either do nothing or lock everyone out.

// Provider types handled by the core SSO module.
export const CORE_SSO_PROVIDER_TYPES: string[] = [
  'oidc',
  'google',
  'saml',
  'ldap',
];

// Whether core ships a two-factor implementation.
export const CORE_MFA_SUPPORTED = true;

function hasEnterpriseModule(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return !!require('../../ee/ee.module')?.EeModule;
  } catch {
    return false;
  }
}

export function isMfaSupported(): boolean {
  return CORE_MFA_SUPPORTED || hasEnterpriseModule();
}

export function isSsoProviderTypeSupported(type: string): boolean {
  return (
    CORE_SSO_PROVIDER_TYPES.includes(type?.toLowerCase()) ||
    hasEnterpriseModule()
  );
}
