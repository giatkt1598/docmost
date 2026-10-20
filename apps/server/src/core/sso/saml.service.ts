import { Injectable } from '@nestjs/common';
import { SAML } from '@node-saml/passport-saml';
import type { Profile } from '@node-saml/passport-saml';
import { AuthProvider } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SsoIdentity } from './sso-login.service';

type SamlProvider = Pick<AuthProvider, 'id' | 'samlUrl' | 'samlCertificate'>;

export type SamlUrls = {
  // SP entity id; the metadata URL doubles as a stable, unique identifier
  entityId: string;
  callbackUrl: string;
};

const EMAIL_ATTRIBUTES = [
  'email',
  'mail',
  'urn:oid:0.9.2342.19200300.100.1.3',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
];
const NAME_ATTRIBUTES = [
  'displayName',
  'name',
  'cn',
  'urn:oid:2.16.840.1.113730.3.1.241',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
];
const GROUP_ATTRIBUTES = [
  'groups',
  'memberOf',
  'http://schemas.xmlsoap.org/claims/Group',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
];

// Strips PEM armour and whitespace so pasted certificates in either form work.
export function normalizeCertificate(cert: string): string {
  return cert
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
}

function pick(profile: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = profile[key];
    if (Array.isArray(value) && value.length) return String(value[0]);
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

export function identityFromSamlProfile(profile: Profile): SsoIdentity {
  const p = profile as unknown as Record<string, unknown>;
  const nameIdIsEmail =
    profile.nameIDFormat?.includes('emailAddress') ||
    /^[^@\s]+@[^@\s]+$/.test(profile.nameID ?? '');

  let name = pick(p, NAME_ATTRIBUTES);
  if (!name) {
    const given = pick(p, ['givenName', 'firstName']);
    const family = pick(p, ['sn', 'surname', 'lastName']);
    name = [given, family].filter(Boolean).join(' ') || undefined;
  }

  const groups: string[] = [];
  for (const key of GROUP_ATTRIBUTES) {
    const value = p[key];
    if (Array.isArray(value)) groups.push(...value.map(String));
    else if (typeof value === 'string') groups.push(value);
  }

  return {
    providerUserId: profile.nameID,
    email: pick(p, EMAIL_ATTRIBUTES) ?? (nameIdIsEmail ? profile.nameID : null),
    name,
    groups,
  };
}

@Injectable()
export class SamlService {
  constructor(private readonly environmentService: EnvironmentService) {}

  async buildLoginUrl(
    provider: SamlProvider,
    urls: SamlUrls,
    relayState: string,
  ): Promise<string> {
    return this.client(provider, urls).getAuthorizeUrlAsync(
      relayState,
      undefined,
      {},
    );
  }

  // Verifies the IdP signature, audience and validity window.
  async handleCallback(
    provider: SamlProvider,
    urls: SamlUrls,
    body: Record<string, string>,
  ): Promise<SsoIdentity> {
    const { profile, loggedOut } = await this.client(
      provider,
      urls,
    ).validatePostResponseAsync(body);
    if (!profile || loggedOut) {
      throw new Error('The SAML response did not contain a user');
    }
    return identityFromSamlProfile(profile);
  }

  metadata(provider: SamlProvider, urls: SamlUrls): string {
    return this.client(provider, urls).generateServiceProviderMetadata(null);
  }

  private client(provider: SamlProvider, urls: SamlUrls) {
    return new SAML({
      entryPoint: provider.samlUrl,
      idpCert: normalizeCertificate(provider.samlCertificate),
      issuer: urls.entityId,
      callbackUrl: urls.callbackUrl,
      audience: urls.entityId,
      // either the response or the assertion has to carry a valid signature
      wantAuthnResponseSigned: false,
      wantAssertionsSigned: false,
      identifierFormat: null,
      acceptedClockSkewMs: 60_000,
      disableRequestedAuthnContext:
        this.environmentService.getSamlDisableRequestedAuthnContext(),
    });
  }
}
