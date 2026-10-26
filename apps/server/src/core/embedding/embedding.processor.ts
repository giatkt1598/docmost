import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { AiProviderService } from '../ai/ai-provider.service';
import { AttachmentTextService } from './attachment-text.service';
import { EmbeddingIndexService } from './embedding-index.service';

// Consumes the AI queue: page and workspace changes keep the embeddings of
// the search index up to date. Only registered when the enterprise module,
// which has its own indexer, is not bundled.
@Processor(QueueName.AI_QUEUE, { concurrency: 2 })
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private readonly index: EmbeddingIndexService,
    private readonly aiProvider: AiProviderService,
    private readonly attachmentText: AttachmentTextService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.name) {
        case QueueJob.PAGE_CREATED:
        case QueueJob.PAGE_CONTENT_UPDATED:
        case QueueJob.PAGE_RESTORED:
          return await this.schedulePages(job.data);
        case QueueJob.PAGE_DELETED:
        case QueueJob.PAGE_SOFT_DELETED:
          return await this.index.removePages(job.data.pageIds ?? []);
        case QueueJob.SPACE_DELETED:
          return await this.index.removeSpace(job.data.spaceId);
        case QueueJob.WORKSPACE_DELETED:
          return await this.index.removeWorkspace(job.data.workspaceId);
        case QueueJob.EMBED_PAGE:
          return await this.index.indexPage(job.data.pageId);
        case QueueJob.EMBED_ATTACHMENT:
          return await this.index.indexAttachment(job.data.attachmentId);
        case QueueJob.EMBED_REBUILD:
          // files uploaded before indexing existed get their text first
          await this.attachmentText.indexMissing(job.data.workspaceId);
          return await this.index.rebuildWorkspace(job.data.workspaceId, {
            reset: job.data.reset === true,
            onProgress: (done) => void job.updateProgress(done),
          });
      }
    } catch (err) {
      this.logger.warn(`${job.name} failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private async schedulePages(data: {
    pageIds?: string[];
    workspaceId?: string;
  }) {
    if (!data.workspaceId || !data.pageIds?.length) return;
    const config = await this.aiProvider.resolve(data.workspaceId);
    if (!config?.embeddingModel) return;
    for (const pageId of data.pageIds) {
      await this.index.schedulePage(pageId);
    }
  }
}
