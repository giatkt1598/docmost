import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PageVerificationRepo } from '@docmost/db/repos/page-verification/page-verification.repo';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { computeVerificationStatus } from './page-verification.utils';

const RECONCILE_SCHEDULER_ID = 'page-verification-reconcile-scheduler';
const RECONCILE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
// widest possible reminder window; per-record windows are narrower
const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

// Queues expiry reminders; recipients and de-duplication are handled by
// VerificationNotificationService.
@Injectable()
export class PageVerificationScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PageVerificationScheduler.name);

  constructor(
    private readonly pageVerificationRepo: PageVerificationRepo,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.notificationQueue.upsertJobScheduler(
      RECONCILE_SCHEDULER_ID,
      { every: RECONCILE_INTERVAL_MS },
      { name: QueueJob.VERIFICATION_RECONCILE, data: {} },
    );
    this.logger.debug('Page verification reconcile scheduler created');
  }

  async reconcile(now: Date = new Date()): Promise<void> {
    const candidates = await this.pageVerificationRepo.findExpiringBefore(
      new Date(now.getTime() + LOOKAHEAD_MS),
    );

    for (const verification of candidates) {
      const status = computeVerificationStatus(verification, now);
      const jobName =
        status === 'expired'
          ? QueueJob.PAGE_VERIFICATION_EXPIRED
          : status === 'expiring'
            ? QueueJob.PAGE_VERIFICATION_EXPIRING
            : null;
      if (!jobName) continue;

      await this.notificationQueue.add(jobName, {
        verificationId: verification.id,
      });
    }
  }
}
