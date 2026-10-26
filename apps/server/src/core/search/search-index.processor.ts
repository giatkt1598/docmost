import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { TypesenseService } from './typesense.service';

// Page, space and workspace changes add jobs to the search queue for an
// external search index. With SEARCH_DRIVER=typesense they keep that index
// current; otherwise they are discarded so they do not pile up in Redis.
// Only registered when the enterprise module is not bundled.
@Processor(QueueName.SEARCH_QUEUE, { concurrency: 2 })
export class SearchIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchIndexProcessor.name);

  constructor(private readonly typesense: TypesenseService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (!this.typesense.isEnabled()) return;

    try {
      switch (job.name) {
        case QueueJob.PAGE_CREATED:
        case QueueJob.PAGE_UPDATED:
        case QueueJob.PAGE_RESTORED:
          return await this.typesense.upsertPages(job.data.pageIds ?? []);
        case QueueJob.PAGE_DELETED:
        case QueueJob.PAGE_SOFT_DELETED:
          return await this.typesense.deletePages(job.data.pageIds ?? []);
        case QueueJob.SPACE_DELETED:
          return await this.typesense.deleteSpace(job.data.spaceId);
        case QueueJob.WORKSPACE_DELETED:
          return await this.typesense.deleteWorkspace(job.data.workspaceId);
      }
    } catch (err) {
      this.logger.warn(`${job.name} failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
