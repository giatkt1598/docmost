import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Client, Entry, InvalidCredentialsError } from 'ldapts';
import { AuthProvider } from '@docmost/db/types/entity.types';
import { SsoIdentity } from './sso-login.service';

type LdapProvider = Pick<
  AuthProvider,
  | 'id'
  | 'ldapUrl'
  | 'ldapBindDn'
  | 'ldapBindPassword'
  | 'ldapBaseDn'
  | 'ldapUserSearchFilter'
  | 'ldapUserAttributes'
  | 'ldapTlsEnabled'
  | 'ldapTlsCaCert'
>;

const DEFAULT_ATTRIBUTES = {
  email: 'mail',
  name: 'cn',
  groups: 'memberOf',
};

const INVALID_LOGIN = 'Invalid username or password';

// Escapes a value for use inside an LDAP search filter (RFC 4515).
export function escapeLdapFilterValue(value: string): string {
  return value.replace(
    /[\\*()\0]/g,
    (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'),
  );
}

export function buildLdapFilter(template: string, username: string): string {
  return template.split('{{username}}').join(escapeLdapFilterValue(username));
}

// The first CN of a group DN, e.g. "cn=Engineering,ou=groups,dc=acme" -> "Engineering".
export function groupNameFromDn(value: string): string {
  const match = /^\s*cn=((?:\\.|[^,\\])+)/i.exec(value);
  if (!match) return value;
  return match[1].replace(/\\(.)/g, '$1').trim();
}

function first(value: Entry[string] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === undefined) return undefined;
  return Buffer.isBuffer(v) ? v.toString('utf8') : String(v);
}

function all(value: Entry[string] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((v) =>
    Buffer.isBuffer(v) ? v.toString('utf8') : String(v),
  );
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  // Finds the user with the service account, then proves the password by
  // binding as that user.
  async authenticate(
    provider: LdapProvider,
    username: string,
    password: string,
  ): Promise<SsoIdentity> {
    // an empty password would be an unauthenticated bind, which many
    // directories accept
    if (!username?.trim() || !password) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    const attributes = {
      ...DEFAULT_ATTRIBUTES,
      ...((provider.ldapUserAttributes as Record<string, string>) ?? {}),
    };

    const client = this.createClient(provider);
    try {
      if (provider.ldapTlsEnabled && provider.ldapUrl.startsWith('ldap://')) {
        await client.startTLS(this.tlsOptions(provider));
      }
      if (provider.ldapBindDn) {
        await client.bind(provider.ldapBindDn, provider.ldapBindPassword ?? '');
      }

      const { searchEntries } = await client.search(provider.ldapBaseDn, {
        scope: 'sub',
        filter: buildLdapFilter(provider.ldapUserSearchFilter, username.trim()),
        sizeLimit: 2,
        attributes: [
          attributes.email,
          attributes.name,
          attributes.groups,
          'displayName',
          'entryUUID',
          'objectGUID',
        ],
        explicitBufferAttributes: ['objectGUID'],
      });
      if (searchEntries.length !== 1) {
        throw new UnauthorizedException(INVALID_LOGIN);
      }
      const entry = searchEntries[0];

      try {
        await client.bind(entry.dn, password);
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          throw new UnauthorizedException(INVALID_LOGIN);
        }
        throw err;
      }

      const guid = entry.objectGUID;
      const providerUserId =
        first(entry.entryUUID) ??
        (Buffer.isBuffer(guid) ? guid.toString('hex') : undefined) ??
        entry.dn;

      return {
        providerUserId,
        email: first(entry[attributes.email]),
        name: first(entry[attributes.name]) ?? first(entry.displayName),
        groups: all(entry[attributes.groups]).map(groupNameFromDn),
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`LDAP login failed: ${(err as Error)?.message}`);
      throw new UnauthorizedException('Could not reach the LDAP directory');
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  private createClient(provider: LdapProvider) {
    return new Client({
      url: provider.ldapUrl,
      timeout: 10_000,
      connectTimeout: 10_000,
      ...(provider.ldapUrl.startsWith('ldaps://') && {
        tlsOptions: this.tlsOptions(provider),
      }),
    });
  }

  private tlsOptions(provider: LdapProvider) {
    return provider.ldapTlsCaCert ? { ca: [provider.ldapTlsCaCert] } : {};
  }
}
