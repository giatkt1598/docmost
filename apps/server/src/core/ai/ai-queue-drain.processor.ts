import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueName } from '../../integrations/queue/constants';

// Page and workspace changes add jobs to the AI queue for the enterprise
// embedding indexer. Without it nothing consumed them and they piled up in
// Redis; core AI search uses the full-text index, so they are discarded.
// Only registered when the enterprise module is not bundled.
@Processor(QueueName.AI_QUEUE)
export class AiQueueDrainProcessor extends WorkerHost {
  private readonly logger = new Logger(AiQueueDrainProcessor.name);
  private drained = 0;

  async process(job: Job): Promise<void> {
    this.drained++;
    if (this.drained === 1 || this.drained % 500 === 0) {
      this.logger.debug(
        `Discarding AI queue jobs (${this.drained} so far, latest: ${job.name})`,
      );
    }
  }
}
