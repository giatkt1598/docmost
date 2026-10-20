export type SsoProviderType = "oidc" | "google" | "saml" | "ldap";

// Shape returned by /sso-providers; secrets are never included.
export interface ISsoProvider {
  id: string;
  name: string;
  type: SsoProviderType;
  isEnabled: boolean;
  allowSignup: boolean;
  groupSync: boolean;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  hasOidcClientSecret: boolean;
  samlUrl: string | null;
  samlCertificate: string | null;
  ldapUrl: string | null;
  ldapBindDn: string | null;
  hasLdapBindPassword: boolean;
  ldapBaseDn: string | null;
  ldapUserSearchFilter: string | null;
  ldapUserAttributes: Record<string, string> | null;
  ldapTlsEnabled: boolean | null;
  ldapTlsCaCert: string | null;
  isSupported: boolean;
  callbackUrl: string;
  samlEntityId: string | null;
  createdAt: string;
}

export type ISsoProviderInput = Partial<
  Omit<
    ISsoProvider,
    | "id"
    | "hasOidcClientSecret"
    | "hasLdapBindPassword"
    | "isSupported"
    | "callbackUrl"
    | "samlEntityId"
    | "createdAt"
  >
> & {
  oidcClientSecret?: string;
  ldapBindPassword?: string;
};

// Public provider info on the login page.
export interface IPublicAuthProvider {
  id: string;
  name: string;
  type: SsoProviderType;
}
