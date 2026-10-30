import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AuditRepo } from '@docmost/db/repos/audit/audit.repo';
import {
  ActorType,
  AuditLogPayload,
  EXCLUDED_AUDIT_EVENTS,
} from '../../common/events/audit-events';
import {
  AUDIT_CONTEXT_KEY,
  AuditContext,
} from '../../common/middlewares/audit-context.middleware';
import {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { ipOrNull, redactSensitive, uuidOrNull } from './audit-sanitize';

export type AuditJobRow = {
  workspaceId: string;
  actorId: string | null;
  actorType: ActorType;
  event: string;
  resourceType: string;
  resourceId: string | null;
  spaceId: string | null;
  changes: Record<string, any> | null;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
};

@Injectable()
export class AuditWriterService implements IAuditService {
  private readonly logger = new Logger(AuditWriterService.name);

  constructor(
    private readonly cls: ClsService,
    private readonly auditRepo: AuditRepo,
    @InjectQueue(QueueName.AUDIT_QUEUE) private readonly auditQueue: Queue,
  ) {}

  log(payload: AuditLogPayload): void {
    const context = this.requestContext();
    if (!context?.workspaceId) {
      // background code has no request: it must use logWithContext
      this.logger.warn(`Dropped ${payload.event}: no workspace in context`);
      return;
    }

    this.enqueue([payload], {
      workspaceId: context.workspaceId,
      actorId: context.actorId ?? undefined,
      actorType: context.actorType,
      ipAddress: context.ipAddress ?? undefined,
      userAgent: context.userAgent ?? undefined,
    });
  }

  logWithContext(payload: AuditLogPayload, context: AuditLogContext): void {
    this.enqueue([payload], context);
  }

  logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
  ): void {
    this.enqueue(payloads, context);
  }

  setActorId(actorId: string): void {
    const context = this.requestContext();
    if (context) context.actorId = actorId;
  }

  setActorType(actorType: ActorType): void {
    const context = this.requestContext();
    if (context) context.actorType = actorType;
  }

  updateRetention(workspaceId: string, retentionDays: number): Promise<void> {
    return this.auditRepo.setRetentionDays(workspaceId, retentionDays);
  }

  private requestContext(): AuditContext | undefined {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
  }

  private enqueue(payloads: AuditLogPayload[], context: AuditLogContext) {
    const occurredAt = new Date().toISOString();
    const rows = payloads
      .filter((payload) => !EXCLUDED_AUDIT_EVENTS.has(payload.event))
      .map((payload) => toRow(payload, context, occurredAt));
    if (rows.length === 0) return;

    // Not awaited: an audit outage must never hold up or fail the action.
    this.auditQueue.add(QueueJob.AUDIT_LOG, { rows }).catch((err) => {
      this.logger.error(
        `Lost ${rows.length} audit event(s) (${rows[0].event}): ${err?.message}`,
      );
    });
  }
}

function toRow(
  payload: AuditLogPayload,
  context: AuditLogContext,
  occurredAt: string,
): AuditJobRow {
  return {
    workspaceId: context.workspaceId,
    actorId: uuidOrNull(context.actorId),
    actorType: context.actorType ?? 'user',
    event: payload.event,
    resourceType: payload.resourceType,
    resourceId: uuidOrNull(payload.resourceId),
    spaceId: uuidOrNull(payload.spaceId),
    changes: payload.changes ? redactSensitive(payload.changes) : null,
    metadata: payload.metadata ? redactSensitive(payload.metadata) : null,
    ipAddress: ipOrNull(context.ipAddress),
    userAgent: context.userAgent?.slice(0, 512) ?? null,
    occurredAt,
  };
}
