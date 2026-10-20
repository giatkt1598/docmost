import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, Workspace } from '@docmost/db/types/entity.types';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import { DomainService } from '../../integrations/environment/domain.service';
import { isSsoProviderTypeSupported } from '../auth/auth-capabilities';
import {
  CreateSsoProviderDto,
  SsoProviderType,
  UpdateSsoProviderDto,
} from './dto/sso-provider.dto';

export const GOOGLE_ISSUER = 'https://accounts.google.com';

// Fields stored encrypted and never sent back to the client.
const SECRET_FIELDS = ['oidcClientSecret', 'ldapBindPassword'] as const;

@Injectable()
export class SsoProviderService {
  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly encryptionService: EncryptionService,
    private readonly domainService: DomainService,
  ) {}

  async list(workspace: Workspace) {
    const providers = await this.authProviderRepo.list(workspace.id);
    return providers.map((p) => this.toPublic(p, workspace));
  }

  async get(providerId: string, workspace: Workspace) {
    return this.toPublic(await this.find(providerId, workspace.id), workspace);
  }

  async create(
    dto: CreateSsoProviderDto,
    userId: string,
    workspace: Workspace,
  ) {
    if (!isSsoProviderTypeSupported(dto.type)) {
      throw new BadRequestException(
        `${dto.type.toUpperCase()} sign-in is not available on this server`,
      );
    }
    const fields = this.normalize(dto.type, dto);
    this.validateRequired(dto.type, { ...fields });

    const provider = await this.authProviderRepo.insert({
      ...fields,
      type: dto.type,
      name: dto.name.trim(),
      isEnabled: dto.isEnabled ?? true,
      allowSignup: dto.allowSignup ?? false,
      groupSync: dto.groupSync ?? false,
      creatorId: userId,
      workspaceId: workspace.id,
    });
    return this.toPublic(provider, workspace);
  }

  async update(dto: UpdateSsoProviderDto, workspace: Workspace) {
    const existing = await this.find(dto.providerId, workspace.id);
    const type = existing.type as SsoProviderType;
    const fields = this.normalize(type, dto);

    if (dto.isEnabled === false && existing.isEnabled) {
      await this.assertNotLastEnforcedProvider(existing, workspace);
    }
    this.validateRequired(type, {
      ...existing,
      ...fields,
    });

    await this.authProviderRepo.update(existing.id, workspace.id, {
      ...fields,
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
      ...(dto.allowSignup !== undefined && { allowSignup: dto.allowSignup }),
      ...(dto.groupSync !== undefined && { groupSync: dto.groupSync }),
    });
    return this.get(existing.id, workspace);
  }

  async remove(providerId: string, workspace: Workspace) {
    const existing = await this.find(providerId, workspace.id);
    if (existing.isEnabled) {
      await this.assertNotLastEnforcedProvider(existing, workspace);
    }
    await this.authProviderRepo.softDelete(existing.id, workspace.id);
  }

  // For the login flows: an enabled provider with decrypted secrets.
  async getForLogin(providerId: string, workspaceId: string) {
    const provider = await this.authProviderRepo.findById(
      providerId,
      workspaceId,
    );
    if (!provider || !provider.isEnabled) {
      throw new NotFoundException('SSO provider not found');
    }
    if (!isSsoProviderTypeSupported(provider.type)) {
      throw new BadRequestException('This SSO provider is not supported');
    }
    return {
      ...provider,
      oidcClientSecret: this.decrypt(provider.oidcClientSecret),
      ldapBindPassword: this.decrypt(provider.ldapBindPassword),
    };
  }

  // SAML metadata is needed while the provider is still being set up, so
  // this does not require it to be enabled.
  async getSamlProvider(providerId: string, workspaceId: string) {
    const provider = await this.find(providerId, workspaceId);
    if (provider.type !== 'saml') {
      throw new NotFoundException('SSO provider not found');
    }
    return provider;
  }

  appUrl(workspace: Workspace) {
    return this.domainService.getUrl(workspace.hostname ?? undefined);
  }

  samlUrls(provider: { id: string }, workspace: Workspace) {
    const base = this.domainService.getUrl(workspace.hostname ?? undefined);
    return {
      entityId: `${base}/api/auth-sso/${provider.id}/saml/metadata`,
      callbackUrl: this.callbackUrl(
        { id: provider.id, type: 'saml' },
        workspace,
      ),
    };
  }

  callbackUrl(provider: { id: string; type: string }, workspace: Workspace) {
    const base = this.domainService.getUrl(workspace.hostname ?? undefined);
    const suffix = provider.type === 'saml' ? 'saml/callback' : 'callback';
    return `${base}/api/auth-sso/${provider.id}/${suffix}`;
  }

  // Turning off the last working provider while SSO is enforced would lock
  // everyone except the owner out.
  private async assertNotLastEnforcedProvider(
    provider: AuthProvider,
    workspace: Workspace,
  ) {
    if (!workspace.enforceSso) return;
    const others = (await this.authProviderRepo.list(workspace.id)).filter(
      (p) =>
        p.id !== provider.id &&
        p.isEnabled &&
        isSsoProviderTypeSupported(p.type),
    );
    if (others.length === 0) {
      throw new BadRequestException(
        'Turn off SSO enforcement before disabling the last SSO provider',
      );
    }
  }

  private normalize(type: SsoProviderType, dto: Record<string, any>) {
    const pick = (keys: string[]) =>
      Object.fromEntries(
        keys
          .filter((k) => dto[k] !== undefined)
          .map((k) => [k, typeof dto[k] === 'string' ? dto[k].trim() : dto[k]]),
      );

    const fields: Record<string, any> =
      type === 'oidc' || type === 'google'
        ? pick(['oidcIssuer', 'oidcClientId', 'oidcClientSecret'])
        : type === 'saml'
          ? pick(['samlUrl', 'samlCertificate'])
          : pick([
              'ldapUrl',
              'ldapBindDn',
              'ldapBindPassword',
              'ldapBaseDn',
              'ldapUserSearchFilter',
              'ldapUserAttributes',
              'ldapTlsEnabled',
              'ldapTlsCaCert',
            ]);

    if (type === 'google') fields.oidcIssuer = GOOGLE_ISSUER;

    for (const key of SECRET_FIELDS) {
      if (key in fields) {
        // an empty secret on update means "keep the stored one"
        if (!fields[key]) delete fields[key];
        else
          fields[key] = this.encryptionService.encrypt(
            fields[key],
            EncryptionPurpose.SSO_CREDENTIALS,
          );
      }
    }
    return fields;
  }

  private validateRequired(type: SsoProviderType, values: Record<string, any>) {
    const required: Record<SsoProviderType, string[]> = {
      oidc: ['oidcIssuer', 'oidcClientId', 'oidcClientSecret'],
      google: ['oidcClientId', 'oidcClientSecret'],
      saml: ['samlUrl', 'samlCertificate'],
      ldap: ['ldapUrl', 'ldapBaseDn', 'ldapUserSearchFilter'],
    };
    const missing = required[type].filter((k) => !values[k]);
    if (missing.length) {
      throw new BadRequestException(
        `Missing required fields: ${missing.join(', ')}`,
      );
    }
    if (values.oidcIssuer && !/^https?:\/\//i.test(values.oidcIssuer)) {
      throw new BadRequestException('Issuer URL must start with http(s)://');
    }
    if (values.samlUrl && !/^https?:\/\//i.test(values.samlUrl)) {
      throw new BadRequestException(
        'SAML sign-in URL must start with http(s)://',
      );
    }
    if (values.ldapUrl && !/^ldaps?:\/\//i.test(values.ldapUrl)) {
      throw new BadRequestException(
        'LDAP URL must start with ldap:// or ldaps://',
      );
    }
    if (
      values.ldapUserSearchFilter &&
      !values.ldapUserSearchFilter.includes('{{username}}')
    ) {
      throw new BadRequestException(
        'The user search filter must contain {{username}}',
      );
    }
  }

  private async find(providerId: string, workspaceId: string) {
    const provider = await this.authProviderRepo.findById(
      providerId,
      workspaceId,
    );
    if (!provider) throw new NotFoundException('SSO provider not found');
    return provider;
  }

  private decrypt(value: string | null): string | null {
    if (!value) return null;
    return this.encryptionService.decrypt(
      value,
      EncryptionPurpose.SSO_CREDENTIALS,
    );
  }

  private toPublic(p: AuthProvider, workspace: Workspace) {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      isEnabled: p.isEnabled,
      allowSignup: p.allowSignup,
      groupSync: p.groupSync,
      oidcIssuer: p.oidcIssuer,
      oidcClientId: p.oidcClientId,
      hasOidcClientSecret: !!p.oidcClientSecret,
      samlUrl: p.samlUrl,
      samlCertificate: p.samlCertificate,
      ldapUrl: p.ldapUrl,
      ldapBindDn: p.ldapBindDn,
      hasLdapBindPassword: !!p.ldapBindPassword,
      ldapBaseDn: p.ldapBaseDn,
      ldapUserSearchFilter: p.ldapUserSearchFilter,
      ldapUserAttributes: p.ldapUserAttributes,
      ldapTlsEnabled: p.ldapTlsEnabled,
      ldapTlsCaCert: p.ldapTlsCaCert,
      isSupported: isSsoProviderTypeSupported(p.type),
      callbackUrl: this.callbackUrl(p, workspace),
      samlEntityId:
        p.type === 'saml' ? this.samlUrls(p, workspace).entityId : null,
      createdAt: p.createdAt,
    };
  }
}
