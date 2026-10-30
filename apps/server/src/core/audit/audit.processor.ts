import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AuditRepo } from '@docmost/db/repos/audit/audit.repo';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { AuditJobRow } from './audit-writer.service';
import { AuditLogService } from './audit-log.service';

@Processor(QueueName.AUDIT_QUEUE, { concurrency: 5 })
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(
    private readonly auditRepo: AuditRepo,
    private readonly auditLogService: AuditLogService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.name) {
        case QueueJob.AUDIT_LOG:
          return await this.write(job.data.rows as AuditJobRow[]);
        case QueueJob.AUDIT_CLEANUP:
          await this.auditLogService.cleanup();
          return;
      }
    } catch (err) {
      this.logger.warn(`${job.name} failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private write(rows: AuditJobRow[]) {
    return this.auditRepo.insertMany(
      rows.map((row) => ({
        ...row,
        occurredAt: new Date(row.occurredAt),
      })),
    );
  }
}
