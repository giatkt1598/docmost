import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditRepo } from '@docmost/db/repos/audit/audit.repo';
import { Workspace } from '@docmost/db/types/entity.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { ListAuditLogsDto } from './dto/audit.dto';

export const DEFAULT_AUDIT_RETENTION_DAYS = 365;

const CLEANUP_SCHEDULER_ID = 'audit-cleanup-scheduler';
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 5000;

const RESOURCE_LOOKUPS: Record<string, 'page' | 'space' | 'group' | 'user'> = {
  [AuditResource.PAGE]: 'page',
  [AuditResource.SPACE]: 'space',
  [AuditResource.GROUP]: 'group',
  [AuditResource.USER]: 'user',
};

@Injectable()
export class AuditLogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly auditRepo: AuditRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectQueue(QueueName.AUDIT_QUEUE) private readonly auditQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.auditQueue.upsertJobScheduler(
      CLEANUP_SCHEDULER_ID,
      { every: CLEANUP_INTERVAL_MS },
      { name: QueueJob.AUDIT_CLEANUP, data: {} },
    );
  }

  async list(workspace: Workspace, dto: ListAuditLogsDto) {
    const result = await this.auditRepo.findPage(
      workspace.id,
      {
        event: dto.event,
        resourceType: dto.resourceType,
        actorId: dto.actorId,
        spaceId: dto.spaceId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      dto,
    );

    const ids = { page: [], space: [], group: [], user: [] };
    for (const item of result.items) {
      const lookup = RESOURCE_LOOKUPS[item.resourceType];
      if (lookup && item.resourceId) ids[lookup].push(item.resourceId);
    }
    const resources = await this.auditRepo.findResourceNames(workspace.id, ids);
    const byId = new Map(resources.map((r) => [r.id, r]));

    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        resource: item.resourceId ? (byId.get(item.resourceId) ?? null) : null,
      })),
    };
  }

  async getRetention(workspaceId: string) {
    const retentionDays = await this.auditRepo.getRetentionDays(workspaceId);
    return { retentionDays: retentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS };
  }

  async updateRetention(workspaceId: string, retentionDays: number) {
    const { retentionDays: previous } = await this.getRetention(workspaceId);
    await this.auditService.updateRetention(workspaceId, retentionDays);

    if (previous !== retentionDays) {
      this.auditService.log({
        event: AuditEvent.WORKSPACE_UPDATED,
        resourceType: AuditResource.WORKSPACE,
        resourceId: workspaceId,
        changes: {
          before: { auditRetentionDays: previous },
          after: { auditRetentionDays: retentionDays },
        },
      });
    }
    return { retentionDays };
  }

  async cleanup(now: Date = new Date()): Promise<number> {
    const workspaces = await this.auditRepo.listWorkspaceRetention();
    let removed = 0;

    for (const workspace of workspaces) {
      const days = workspace.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      let deleted: number;
      do {
        deleted = await this.auditRepo.deleteOlderThan(
          workspace.id,
          cutoff,
          CLEANUP_BATCH_SIZE,
        );
        removed += deleted;
      } while (deleted === CLEANUP_BATCH_SIZE);
    }

    this.logger.debug(`Audit cleanup removed ${removed} row(s)`);
    return removed;
  }
}
