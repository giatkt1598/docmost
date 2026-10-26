import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueName } from '../../integrations/queue/constants';

// Page, space and workspace changes add jobs to the search queue for an
// external search index. Nothing consumed them and they piled up in Redis.
// Only registered when the enterprise module is not bundled.
@Processor(QueueName.SEARCH_QUEUE)
export class SearchIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchIndexProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`Discarding search job ${job.name}`);
  }
}
