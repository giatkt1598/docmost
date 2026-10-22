import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { MediaLocalizeService } from './media-localize.service';
import { LocalizeMediaJob } from './media-localize.queue';

@Processor(QueueName.MEDIA_QUEUE, { concurrency: 2 })
export class MediaLocalizeProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(MediaLocalizeProcessor.name);

  constructor(private readonly mediaLocalizeService: MediaLocalizeService) {
    super();
  }

  async process(job: Job<LocalizeMediaJob>): Promise<void> {
    if (job.name !== QueueJob.LOCALIZE_PAGE_MEDIA) return;
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await this.mediaLocalizeService.run(job.data.pageId, isLastAttempt);
  }

  @OnWorkerEvent('failed')
  onError(job: Job) {
    this.logger.warn(
      `Error processing ${job.name} job. Reason: ${job.failedReason}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
