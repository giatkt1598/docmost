import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SiemDestination, User, Workspace } from '@docmost/db/types/entity.types';
import { SiemDestinationRepo } from '@docmost/db/repos/siem/siem-destination.repo';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  OutboundUrlError,
  OutboundUrlGuard,
} from '../../integrations/outbound/outbound-url.guard';
import {
  AuditEvent,
  AuditEventType,
  AuditResource,
} from '../../common/events/audit-events';
import {
  CreateSiemDestinationDto,
  TestSiemDestinationDto,
  UpdateSiemDestinationDto,
} from './dto/siem.dto';
import {
  assertRequiredSecrets,
  normalizeConfig,
  normalizeSecrets,
  SiemConfig,
  SiemSecrets,
} from './siem-config';
import {
  SiemDeliveryError,
  SiemTransportService,
} from './siem-transport.service';
import {
  SIEM_MAX_DESTINATIONS,
  SIEM_STATUS,
  SiemType,
} from './siem.constants';

// Clearing the failure state, so a re-enabled destination starts over.
const FRESH_DELIVERY_STATE = {
  status: SIEM_STATUS.HEALTHY,
  consecutiveFailures: 0,
  failingSince: null,
  nextAttemptAt: null,
  lastError: null,
  lastErrorAt: null,
};

@Injectable()
export class SiemService {
  constructor(
    private readonly destinationRepo: SiemDestinationRepo,
    private readonly encryption: EncryptionService,
    private readonly transport: SiemTransportService,
    private readonly urlGuard: OutboundUrlGuard,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async list(workspace: Workspace) {
    const destinations = await this.destinationRepo.listByWorkspace(
      workspace.id,
    );
    return destinations.map((destination) => this.toPublic(destination));
  }

  async create(dto: CreateSiemDestinationDto, user: User, workspace: Workspace) {
    const count = await this.destinationRepo.countByWorkspace(workspace.id);
    if (count >= SIEM_MAX_DESTINATIONS) {
      throw new BadRequestException(
        `A workspace can have ${SIEM_MAX_DESTINATIONS} SIEM destinations`,
      );
    }

    const config = normalizeConfig(dto.type, dto.config);
    const secrets = normalizeSecrets(dto.secrets);
    assertRequiredSecrets(dto.type, secrets);
    await this.assertUrlAllowed(config);

    const destination = await this.destinationRepo.insert({
      workspaceId: workspace.id,
      creatorId: user.id,
      name: dto.name,
      type: dto.type,
      enabled: dto.enabled ?? true,
      config,
      secrets: this.encryptSecrets(secrets),
    });
    this.audit(AuditEvent.SIEM_DESTINATION_CREATED, destination);
    return this.toPublic(destination);
  }

  async update(dto: UpdateSiemDestinationDto, workspace: Workspace) {
    const existing = await this.find(dto.destinationId, workspace.id);
    const type = existing.type as SiemType;

    const config = dto.config
      ? normalizeConfig(type, dto.config)
      : (existing.config as SiemConfig);
    const secrets = {
      ...this.decryptSecrets(existing),
      ...stripEmpty(normalizeSecrets(dto.secrets)),
    };
    assertRequiredSecrets(type, secrets);
    if (dto.config) await this.assertUrlAllowed(config);

    const reEnabled = dto.enabled === true && !existing.enabled;
    const updated = await this.destinationRepo.updateConfiguration(
      existing.id,
      workspace.id,
      {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(reEnabled && FRESH_DELIVERY_STATE),
        config,
        secrets: this.encryptSecrets(secrets),
      },
    );
    this.audit(AuditEvent.SIEM_DESTINATION_UPDATED, updated);
    return this.toPublic(updated);
  }

  async remove(destinationId: string, workspace: Workspace) {
    const existing = await this.find(destinationId, workspace.id);
    await this.destinationRepo.remove(existing.id, workspace.id);
    this.audit(AuditEvent.SIEM_DESTINATION_DELETED, existing);
  }

  async retry(destinationId: string, workspace: Workspace) {
    const existing = await this.find(destinationId, workspace.id);
    await this.destinationRepo.updateConfiguration(existing.id, workspace.id, {
      ...FRESH_DELIVERY_STATE,
      enabled: true,
    });
  }

  // Sends one sample event, using saved credentials for what the form left blank.
  async test(dto: TestSiemDestinationDto, workspace: Workspace) {
    const existing = dto.destinationId
      ? await this.find(dto.destinationId, workspace.id)
      : null;
    const type = (existing?.type as SiemType) ?? dto.type;
    const config = normalizeConfig(type, dto.config);
    const secrets = {
      ...(existing ? this.decryptSecrets(existing) : {}),
      ...stripEmpty(normalizeSecrets(dto.secrets)),
    };
    assertRequiredSecrets(type, secrets);

    try {
      await this.transport.send(type, config, secrets, [
        {
          id: '00000000-0000-7000-8000-000000000000',
          timestamp: new Date().toISOString(),
          source: 'docmost',
          workspaceId: workspace.id,
          event: AuditEvent.SIEM_DESTINATION_TEST,
          actor: { id: null, type: 'system', email: null },
          resource: { type: AuditResource.SIEM_DESTINATION, id: null },
          spaceId: null,
          changes: null,
          metadata: null,
          ipAddress: null,
          userAgent: null,
        },
      ]);
      return { delivered: true };
    } catch (err) {
      return {
        delivered: false,
        error: (err as Error).message,
        statusCode: err instanceof SiemDeliveryError ? err.statusCode : undefined,
      };
    }
  }

  private async find(destinationId: string, workspaceId: string) {
    const destination = await this.destinationRepo.findById(
      destinationId,
      workspaceId,
    );
    if (!destination) {
      throw new NotFoundException('SIEM destination not found');
    }
    return destination;
  }

  // Early feedback only: delivery checks the address again on every send.
  private async assertUrlAllowed(config: SiemConfig) {
    if (!('url' in config)) return;
    try {
      await this.urlGuard.validate(config.url);
    } catch (err) {
      if (err instanceof OutboundUrlError && !err.retryable) {
        throw new BadRequestException(err.message);
      }
    }
  }

  private encryptSecrets(secrets: SiemSecrets): string {
    return this.encryption.encrypt(
      JSON.stringify(secrets),
      EncryptionPurpose.SIEM_CREDENTIALS,
    );
  }

  private decryptSecrets(destination: SiemDestination): SiemSecrets {
    return JSON.parse(
      this.encryption.decrypt(
        destination.secrets,
        EncryptionPurpose.SIEM_CREDENTIALS,
      ),
    );
  }

  private audit(event: AuditEventType, destination: SiemDestination) {
    this.auditService.log({
      event,
      resourceType: AuditResource.SIEM_DESTINATION,
      resourceId: destination.id,
      metadata: { name: destination.name, type: destination.type },
    });
  }

  // Never includes credentials, the cursor or the version.
  private toPublic(destination: SiemDestination) {
    const secrets = this.decryptSecrets(destination);
    return {
      id: destination.id,
      name: destination.name,
      type: destination.type,
      enabled: destination.enabled,
      status: destination.status,
      config: destination.config,
      hasSecrets: {
        token: !!secrets.token,
        apiKey: !!secrets.apiKey,
      },
      lastDeliveredAt: destination.lastDeliveredAt,
      lastError: destination.lastError,
      lastErrorAt: destination.lastErrorAt,
      consecutiveFailures: destination.consecutiveFailures,
      nextAttemptAt: destination.nextAttemptAt,
      failingSince: destination.failingSince,
      createdAt: destination.createdAt,
      updatedAt: destination.updatedAt,
    };
  }
}

function stripEmpty(secrets: SiemSecrets): SiemSecrets {
  return Object.fromEntries(
    Object.entries(secrets).filter(([, value]) => !!value),
  );
}
