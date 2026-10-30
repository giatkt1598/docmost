import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { SiemDeliveryService } from './siem-delivery.service';

@Processor(QueueName.SIEM_QUEUE, { concurrency: 3 })
export class SiemProcessor extends WorkerHost {
  private readonly logger = new Logger(SiemProcessor.name);

  constructor(private readonly delivery: SiemDeliveryService) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.name) {
        case QueueJob.SIEM_SWEEP:
          return await this.delivery.sweep();
        case QueueJob.SIEM_DELIVER:
          return await this.delivery.deliver(job.data.destinationId);
      }
    } catch (err) {
      this.logger.warn(`${job.name} failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
