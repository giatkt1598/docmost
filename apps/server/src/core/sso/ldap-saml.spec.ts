import { UnauthorizedException } from '@nestjs/common';
import {
  buildLdapFilter,
  escapeLdapFilterValue,
  groupNameFromDn,
  LdapService,
} from './ldap.service';
import {
  identityFromSamlProfile,
  normalizeCertificate,
  SamlService,
} from './saml.service';

const ldapClient = {
  startTLS: jest.fn(),
  bind: jest.fn(),
  search: jest.fn(),
  unbind: jest.fn().mockResolvedValue(undefined),
};
jest.mock('ldapts', () => {
  class InvalidCredentialsError extends Error {}
  return {
    Client: jest.fn(() => ldapClient),
    InvalidCredentialsError,
  };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { InvalidCredentialsError } = require('ldapts');

const ldapProvider = {
  id: 'p1',
  ldapUrl: 'ldap://ldap.acme.com',
  ldapBindDn: 'cn=svc,dc=acme',
  ldapBindPassword: 'svc-pass',
  ldapBaseDn: 'ou=people,dc=acme',
  ldapUserSearchFilter: '(uid={{username}})',
  ldapUserAttributes: null,
  ldapTlsEnabled: false,
  ldapTlsCaCert: null,
} as any;

describe('LDAP filters', () => {
  it('escapes filter metacharacters (RFC 4515)', () => {
    expect(escapeLdapFilterValue('a*b(c)d\\e\0')).toBe(
      'a\\2ab\\28c\\29d\\5ce\\00',
    );
  });

  it('substitutes every username placeholder', () => {
    expect(
      buildLdapFilter('(|(uid={{username}})(mail={{username}}))', 'x*)('),
    ).toBe('(|(uid=x\\2a\\29\\28)(mail=x\\2a\\29\\28))');
  });

  it('reads group names from DNs', () => {
    expect(groupNameFromDn('cn=Engineering,ou=groups,dc=acme')).toBe(
      'Engineering',
    );
    expect(groupNameFromDn('CN=R\\, D,ou=groups')).toBe('R, D');
    expect(groupNameFromDn('Support')).toBe('Support');
  });
});

describe('LdapService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ldapClient.bind.mockResolvedValue(undefined);
    ldapClient.search.mockResolvedValue({
      searchEntries: [
        {
          dn: 'uid=ann,ou=people,dc=acme',
          mail: 'ann@acme.com',
          cn: 'Ann',
          memberOf: ['cn=Engineering,ou=groups,dc=acme'],
          entryUUID: 'uuid-1',
        },
      ],
    });
  });

  it('binds as the service account, then as the user', async () => {
    const identity = await new LdapService().authenticate(
      ldapProvider,
      'ann',
      'pw',
    );

    expect(ldapClient.bind.mock.calls).toEqual([
      ['cn=svc,dc=acme', 'svc-pass'],
      ['uid=ann,ou=people,dc=acme', 'pw'],
    ]);
    expect(ldapClient.search.mock.calls[0][1].filter).toBe('(uid=ann)');
    expect(identity).toEqual({
      providerUserId: 'uuid-1',
      email: 'ann@acme.com',
      name: 'Ann',
      groups: ['Engineering'],
    });
  });

  it('never binds with an empty password', async () => {
    await expect(
      new LdapService().authenticate(ldapProvider, 'ann', ''),
    ).rejects.toThrow(UnauthorizedException);
    expect(ldapClient.bind).not.toHaveBeenCalled();
  });

  it('rejects wrong passwords and ambiguous matches', async () => {
    ldapClient.bind
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new InvalidCredentialsError('bad'));
    await expect(
      new LdapService().authenticate(ldapProvider, 'ann', 'wrong'),
    ).rejects.toThrow('Invalid username or password');

    ldapClient.search.mockResolvedValueOnce({
      searchEntries: [{ dn: 'a' }, { dn: 'b' }],
    });
    await expect(
      new LdapService().authenticate(ldapProvider, 'ann', 'pw'),
    ).rejects.toThrow('Invalid username or password');
  });

  it('uses StartTLS for ldap:// when TLS is on', async () => {
    await new LdapService().authenticate(
      { ...ldapProvider, ldapTlsEnabled: true, ldapTlsCaCert: 'CA' },
      'ann',
      'pw',
    );
    expect(ldapClient.startTLS).toHaveBeenCalledWith({ ca: ['CA'] });
  });

  it('honours custom attribute names', async () => {
    ldapClient.search.mockResolvedValueOnce({
      searchEntries: [
        { dn: 'x', userPrincipalName: 'bob@acme.com', displayName: 'Bob' },
      ],
    });
    const identity = await new LdapService().authenticate(
      {
        ...ldapProvider,
        ldapUserAttributes: { email: 'userPrincipalName', name: 'nope' },
      },
      'bob',
      'pw',
    );
    expect(identity).toMatchObject({
      providerUserId: 'x',
      email: 'bob@acme.com',
      name: 'Bob',
    });
  });
});

describe('SAML', () => {
  it('maps common attribute names', () => {
    expect(
      identityFromSamlProfile({
        issuer: 'idp',
        nameID: 'ann-id',
        nameIDFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
        'urn:oid:0.9.2342.19200300.100.1.3': 'ann@acme.com',
        givenName: 'Ann',
        sn: 'Lee',
        groups: ['Engineering', 'Support'],
      } as any),
    ).toEqual({
      providerUserId: 'ann-id',
      email: 'ann@acme.com',
      name: 'Ann Lee',
      groups: ['Engineering', 'Support'],
    });
  });

  it('falls back to an email NameID', () => {
    expect(
      identityFromSamlProfile({ issuer: 'idp', nameID: 'bob@acme.com' } as any)
        .email,
    ).toBe('bob@acme.com');
    expect(
      identityFromSamlProfile({ issuer: 'idp', nameID: 'opaque' } as any).email,
    ).toBeNull();
  });

  it('accepts PEM or bare certificates', () => {
    expect(
      normalizeCertificate(
        '-----BEGIN CERTIFICATE-----\nMIIB\nAAA=\n-----END CERTIFICATE-----\n',
      ),
    ).toBe('MIIBAAA=');
  });

  it('rejects an unsigned response', async () => {
    const service = new SamlService({
      getSamlDisableRequestedAuthnContext: () => false,
    } as any);
    const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r" Version="2.0" IssueInstant="${new Date().toISOString()}"><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="_a" Version="2.0" IssueInstant="${new Date().toISOString()}"><saml:Issuer>idp</saml:Issuer><saml:Subject><saml:NameID>evil@acme.com</saml:NameID></saml:Subject></saml:Assertion></samlp:Response>`;

    await expect(
      service.handleCallback(
        { id: 'p1', samlUrl: 'https://idp/sso', samlCertificate: 'MIIB' },
        { entityId: 'https://docs/sp', callbackUrl: 'https://docs/acs' },
        { SAMLResponse: Buffer.from(xml).toString('base64') },
      ),
    ).rejects.toThrow(/signature/i);
  });
});
