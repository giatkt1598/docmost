import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { IntegrationRepo } from './repos/integration.repo';
import { IntegrationConnectionRepo } from './repos/integration-connection.repo';
import { IntegrationRegistry } from './registry/integration-registry';
import {
  IntegrationConfigService,
  NOT_CONFIGURED_MESSAGE,
} from './integration-config.service';
import { Integration } from '@docmost/db/types/entity.types';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../common/events/audit-events';

@Injectable()
export class IntegrationService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly integrationRepo: IntegrationRepo,
    private readonly connectionRepo: IntegrationConnectionRepo,
    private readonly registry: IntegrationRegistry,
    private readonly configService: IntegrationConfigService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getAvailableIntegrations() {
    return this.registry.getAvailableIntegrations();
  }

  async getInstalledIntegrations(
    workspaceId: string,
  ): Promise<(Integration & { unfurlHosts?: string[] })[]> {
    const integrations =
      await this.integrationRepo.findAllByWorkspace(workspaceId);
    const configSettings = await this.configService.getSettingsMap(workspaceId);
    return integrations.map((integration) => {
      const unfurlHosts = this.registry
        .getProvider(integration.type)
        ?.getUnfurlHosts?.({
          ...((integration.settings as Record<string, any>) ?? {}),
          ...configSettings.get(integration.type),
        });
      return unfurlHosts ? { ...integration, unfurlHosts } : integration;
    });
  }

  // API-token providers have no OAuth callback to create the row.
  async installWithApiToken(
    type: string,
    workspaceId: string,
    userId: string,
  ): Promise<Integration> {
    const definition = this.registry.getProvider(type)?.definition;
    if (!definition || definition.hidden || definition.setup?.auth !== 'apiToken') {
      throw new BadRequestException(`Unknown integration type: ${type}`);
    }
    if (await this.integrationRepo.findByWorkspaceAndType(workspaceId, type)) {
      throw new BadRequestException(`Integration "${type}" is already installed`);
    }
    if (!(await this.configService.findCredentials(workspaceId, type))) {
      throw new BadRequestException(NOT_CONFIGURED_MESSAGE);
    }

    const integration = await this.integrationRepo.insertOrRestore({
      type,
      workspaceId,
      installedById: userId,
    });
    this.auditService.log({
      event: AuditEvent.INTEGRATION_INSTALLED,
      resourceType: AuditResource.INTEGRATION,
      resourceId: integration.id,
      changes: { after: { provider: type } },
    });
    return integration;
  }

  async uninstall(integrationId: string, workspaceId: string): Promise<void> {
    const integration = await this.integrationRepo.findById(integrationId);
    if (!integration || integration.workspaceId !== workspaceId) {
      throw new NotFoundException('Integration not found');
    }
    // Soft delete doesn't cascade to connections
    await executeTx(this.db, async (trx) => {
      await this.connectionRepo.deleteByIntegration(integrationId, trx);
      await this.integrationRepo.softDelete(integrationId, trx);
    });

    this.auditService.log({
      event: AuditEvent.INTEGRATION_UNINSTALLED,
      resourceType: AuditResource.INTEGRATION,
      resourceId: integrationId,
      changes: { before: { provider: integration.type } },
    });
  }
}
