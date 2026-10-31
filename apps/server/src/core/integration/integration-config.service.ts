import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { IntegrationConfig } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import {
  OutboundUrlError,
  OutboundUrlGuard,
} from '../../integrations/outbound/outbound-url.guard';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { IntegrationRegistry } from './registry/integration-registry';
import { IntegrationRepo } from './repos/integration.repo';
import { IntegrationConfigRepo } from './repos/integration-config.repo';
import { IntegrationConnectionRepo } from './repos/integration-connection.repo';
import { OAuthConfig } from './registry/integration-provider.interface';
import { normalizeBaseUrl } from './utils/integration.utils';
import { SaveIntegrationConfigDto } from './dto/integration.dto';

export const NOT_CONFIGURED_MESSAGE =
  'This integration is not configured yet. Ask a workspace admin to add its OAuth app in Settings > Integrations.';

export type IntegrationCredentials = {
  clientId: string;
  clientSecret: string;
};

// Never carries the client secret: this is what the settings page receives.
export type IntegrationConfigView = {
  type: string;
  baseUrl: string | null;
  clientId: string | null;
  hasClientSecret: boolean;
  callbackUrl: string;
};

@Injectable()
export class IntegrationConfigService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly configRepo: IntegrationConfigRepo,
    private readonly integrationRepo: IntegrationRepo,
    private readonly connectionRepo: IntegrationConnectionRepo,
    private readonly registry: IntegrationRegistry,
    private readonly encryptionService: EncryptionService,
    private readonly environmentService: EnvironmentService,
    private readonly urlGuard: OutboundUrlGuard,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getSettings(
    workspaceId: string,
    type: string,
  ): Promise<Record<string, any>> {
    const config = await this.configRepo.findByWorkspaceAndType(
      workspaceId,
      type,
    );
    return this.toSettings(config);
  }

  async getSettingsMap(
    workspaceId: string,
  ): Promise<Map<string, Record<string, any>>> {
    const configs = await this.configRepo.findAllByWorkspace(workspaceId);
    return new Map(configs.map((c) => [c.type, this.toSettings(c)]));
  }

  // Products on one authorization server (Atlassian, Google) share credentials via credentialsKey.
  async findCredentials(
    workspaceId: string,
    type: string,
    oauthConfig?: Pick<OAuthConfig, 'credentialsKey'>,
  ): Promise<IntegrationCredentials | null> {
    const config = await this.configRepo.findByWorkspaceAndType(
      workspaceId,
      oauthConfig?.credentialsKey ?? type,
    );
    if (!config) return null;
    return {
      clientId: config.clientId,
      clientSecret: this.encryptionService.decrypt(
        config.clientSecret,
        EncryptionPurpose.INTEGRATION_CREDENTIALS,
      ),
    };
  }

  async getCredentials(
    workspaceId: string,
    type: string,
    oauthConfig?: Pick<OAuthConfig, 'credentialsKey'>,
  ): Promise<IntegrationCredentials> {
    const credentials = await this.findCredentials(
      workspaceId,
      type,
      oauthConfig,
    );
    if (!credentials) {
      throw new BadRequestException(NOT_CONFIGURED_MESSAGE);
    }
    return credentials;
  }

  async list(workspaceId: string): Promise<IntegrationConfigView[]> {
    const configs = await this.configRepo.findAllByWorkspace(workspaceId);
    return this.registry
      .getAvailableIntegrations()
      .filter((definition) => definition.oauth)
      .map(({ type }) =>
        this.toView(
          type,
          configs.find((c) => c.type === type),
        ),
      );
  }

  async save(
    dto: SaveIntegrationConfigDto,
    workspaceId: string,
    userId: string,
  ): Promise<IntegrationConfigView> {
    const { type } = dto;
    const definition = this.registry.getProvider(type)?.definition;
    if (!definition || definition.hidden || !definition.oauth) {
      throw new BadRequestException(`Unknown integration type: ${type}`);
    }

    const baseUrl = await this.resolveBaseUrl(
      dto.baseUrl,
      definition.setup?.baseUrl ?? 'none',
    );
    const clientId = dto.clientId.trim();

    const existing = await this.configRepo.findByWorkspaceAndType(
      workspaceId,
      type,
    );
    const clientSecret = dto.clientSecret
      ? this.encryptionService.encrypt(
          dto.clientSecret,
          EncryptionPurpose.INTEGRATION_CREDENTIALS,
        )
      : existing?.clientSecret;
    if (!clientSecret) {
      throw new BadRequestException('Client secret is required');
    }

    // Tokens belong to one host and OAuth app, and must never be sent to another.
    const connectionsReset =
      (existing?.baseUrl ?? null) !== baseUrl ||
      (!!existing && existing.clientId !== clientId);

    const saved = await executeTx(this.db, async (trx) => {
      const config = await this.configRepo.upsert(
        {
          workspaceId,
          type,
          baseUrl,
          clientId,
          clientSecret,
          updatedById: userId,
        },
        trx,
      );
      if (connectionsReset) {
        const integration = await this.integrationRepo.findByWorkspaceAndType(
          workspaceId,
          type,
          trx,
        );
        if (integration) {
          await this.connectionRepo.deleteByIntegration(integration.id, trx);
        }
      }
      return config;
    });

    this.auditService.log({
      event: AuditEvent.INTEGRATION_CONFIGURED,
      resourceType: AuditResource.INTEGRATION,
      resourceId: saved.id,
      changes: { after: { provider: type, baseUrl, connectionsReset } },
    });

    return this.toView(type, saved);
  }

  private async resolveBaseUrl(
    value: string | undefined,
    mode: 'none' | 'optional' | 'required',
  ): Promise<string | null> {
    const trimmed = mode === 'none' ? '' : value?.trim();
    if (!trimmed) {
      if (mode === 'required') {
        throw new BadRequestException('Base URL is required');
      }
      return null;
    }

    const baseUrl = normalizeBaseUrl(trimmed);
    if (!baseUrl) {
      throw new BadRequestException('Base URL must be a valid http(s) URL');
    }
    try {
      await this.urlGuard.validate(baseUrl);
    } catch (err) {
      if (err instanceof OutboundUrlError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    return baseUrl;
  }

  private toSettings(config?: IntegrationConfig): Record<string, any> {
    return config?.baseUrl ? { baseUrl: config.baseUrl } : {};
  }

  private toView(
    type: string,
    config?: IntegrationConfig,
  ): IntegrationConfigView {
    const appUrl = this.environmentService.getAppUrl();
    return {
      type,
      baseUrl: config?.baseUrl ?? null,
      clientId: config?.clientId ?? null,
      hasClientSecret: !!config?.clientSecret,
      callbackUrl: `${appUrl}/api/integrations/oauth/${type}/callback`,
    };
  }
}
