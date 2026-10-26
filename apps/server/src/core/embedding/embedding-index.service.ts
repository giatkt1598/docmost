import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { embed, embedMany } from 'ai';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  ensureVectorIndex,
  ensureVectorSchema,
} from '@docmost/db/helpers/vector-schema';
import {
  EmbeddingOwner,
  EmbeddingRow,
  SearchEmbeddingRepo,
} from '@docmost/db/repos/search/search-embedding.repo';
import {
  AiProviderService,
  embeddingProviderOptions,
} from '../ai/ai-provider.service';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { chunkText } from '../search/chunking';

const BATCH_SIZE = 32;
const PAGE_DEBOUNCE_MS = 30_000;
const SCHEMA_RETRY_MS = 5 * 60_000;

type EmbeddingContext = NonNullable<
  Awaited<ReturnType<AiProviderService['embeddingModel']>>
>;

// Turns pages and attachments into embedded chunks (pgvector) and keeps them
// in step with the content. Everything here is a no-op until an embedding
// model is configured and pgvector is installed.
@Injectable()
export class EmbeddingIndexService {
  private readonly logger = new Logger(EmbeddingIndexService.name);
  private schemaReady: { value: boolean; checkedAt: number } | null = null;
  private readonly indexedSizes = new Set<number>();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly repo: SearchEmbeddingRepo,
    private readonly aiProvider: AiProviderService,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  // pgvector table available (created on demand once the extension exists)
  async isStorageReady(): Promise<boolean> {
    const cached = this.schemaReady;
    if (
      cached &&
      (cached.value || Date.now() - cached.checkedAt < SCHEMA_RETRY_MS)
    ) {
      return cached.value;
    }
    const value = await ensureVectorSchema(this.db).catch(() => false);
    this.schemaReady = { value, checkedAt: Date.now() };
    return value;
  }

  // The embedding model of a workspace when semantic search can run.
  async context(workspaceId: string): Promise<EmbeddingContext | null> {
    const model = await this.aiProvider.embeddingModel(workspaceId);
    if (!model) return null;
    if (!(await this.isStorageReady())) return null;
    return model;
  }

  private providerOptions(ctx: EmbeddingContext) {
    return embeddingProviderOptions(
      ctx.config.driver,
      ctx.config.embeddingDimensions,
    );
  }

  private async embedValues(
    ctx: EmbeddingContext,
    values: string[],
  ): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const { embeddings } = await embedMany({
        model: ctx.model,
        values: values.slice(i, i + BATCH_SIZE),
        providerOptions: this.providerOptions(ctx),
      });
      out.push(...embeddings);
    }
    return out;
  }

  // Vector of a search query, or null when semantic search is unavailable.
  async embedQuery(
    workspaceId: string,
    text: string,
  ): Promise<{ vector: number[]; dimensions: number; model: string } | null> {
    const ctx = await this.context(workspaceId);
    if (!ctx) return null;
    const { embedding } = await embed({
      model: ctx.model,
      value: text,
      providerOptions: this.providerOptions(ctx),
      abortSignal: AbortSignal.timeout(15_000),
    });
    return {
      vector: embedding,
      dimensions: embedding.length,
      model: ctx.modelId,
    };
  }

  async indexPage(pageId: string): Promise<void> {
    const page = await this.db
      .selectFrom('pages')
      .select(['id', 'workspaceId', 'title', 'textContent', 'deletedAt'])
      .where('id', '=', pageId)
      .executeTakeFirst();
    if (!page || page.deletedAt) {
      await this.removePages([pageId]);
      return;
    }
    await this.indexOwner(
      { kind: 'page', id: page.id },
      page.workspaceId,
      page.title ?? '',
      page.textContent ?? '',
    );
  }

  async indexAttachment(attachmentId: string): Promise<void> {
    const attachment = await this.db
      .selectFrom('attachments')
      .select(['id', 'workspaceId', 'fileName', 'textContent', 'deletedAt'])
      .where('id', '=', attachmentId)
      .executeTakeFirst();
    if (!attachment || attachment.deletedAt || !attachment.textContent) {
      if (await this.isStorageReady()) {
        await this.repo.deleteForAttachments([attachmentId]);
      }
      return;
    }
    await this.indexOwner(
      { kind: 'attachment', id: attachment.id },
      attachment.workspaceId,
      attachment.fileName,
      attachment.textContent,
    );
  }

  // Embeds the chunks that are new or changed since the last run.
  private async indexOwner(
    owner: EmbeddingOwner,
    workspaceId: string,
    title: string,
    text: string,
  ) {
    const ctx = await this.context(workspaceId);
    if (!ctx) return;

    let chunks = chunkText(text);
    if (chunks.length === 0 && title.trim()) {
      chunks = [{ index: 0, content: title.trim() }];
    }
    if (chunks.length === 0) {
      await this.repo.deleteStale(owner, 0, ctx.modelId);
      return;
    }

    const existing = new Map(
      (await this.repo.listChunks(owner)).map((c) => [c.chunkIndex, c]),
    );
    const prepared = chunks.map((chunk) => {
      const input = title ? `${title}\n${chunk.content}` : chunk.content;
      return {
        chunk,
        input,
        hash: createHash('sha256').update(input).digest('hex'),
      };
    });
    const changed = prepared.filter((p) => {
      const old = existing.get(p.chunk.index);
      return !old || old.contentHash !== p.hash || old.model !== ctx.modelId;
    });

    if (changed.length > 0) {
      const vectors = await this.embedValues(
        ctx,
        changed.map((p) => p.input),
      );
      await this.ensureIndex(vectors[0].length);
      const rows: EmbeddingRow[] = changed.map((p, i) => ({
        workspaceId,
        chunkIndex: p.chunk.index,
        content: p.chunk.content,
        contentHash: p.hash,
        model: ctx.modelId,
        vector: vectors[i],
      }));
      await this.repo.upsertChunks(owner, rows);
    }
    await this.repo.deleteStale(owner, chunks.length, ctx.modelId);
  }

  private async ensureIndex(dimensions: number) {
    if (this.indexedSizes.has(dimensions)) return;
    await ensureVectorIndex(this.db, dimensions);
    this.indexedSizes.add(dimensions);
  }

  async removePages(pageIds: string[]) {
    if (pageIds.length && (await this.isStorageReady())) {
      await this.repo.deleteForPages(pageIds);
    }
  }

  async removeSpace(spaceId: string) {
    if (await this.isStorageReady()) await this.repo.deleteForSpace(spaceId);
  }

  async removeWorkspace(workspaceId: string) {
    if (await this.isStorageReady()) {
      await this.repo.deleteForWorkspace(workspaceId);
    }
  }

  // Page edits arrive in bursts; embed once the page has been quiet.
  async schedulePage(pageId: string) {
    await this.aiQueue.add(
      QueueJob.EMBED_PAGE,
      { pageId },
      {
        delay: PAGE_DEBOUNCE_MS,
        deduplication: {
          id: `embed-page-${pageId}`,
          ttl: PAGE_DEBOUNCE_MS,
          extend: true,
          replace: true,
        },
      },
    );
  }

  async scheduleAttachment(attachmentId: string) {
    await this.aiQueue.add(
      QueueJob.EMBED_ATTACHMENT,
      { attachmentId },
      { jobId: `embed-attachment-${attachmentId}` },
    );
  }

  // Embeds every page and attachment of a workspace; with `reset` the
  // existing embeddings are dropped first (model change, manual rebuild).
  async rebuildWorkspace(
    workspaceId: string,
    opts: { reset: boolean; onProgress?: (done: number) => void },
  ) {
    if (!(await this.context(workspaceId))) return;
    if (opts.reset) await this.repo.deleteForWorkspace(workspaceId);

    let done = 0;
    let cursor: string | null = null;
    for (;;) {
      const after = cursor;
      const pages = await this.db
        .selectFrom('pages')
        .select('id')
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .$if(!!after, (qb) => qb.where('id', '>', after))
        .orderBy('id')
        .limit(50)
        .execute();
      if (pages.length === 0) break;
      for (const page of pages) {
        await this.indexPage(page.id).catch((err) =>
          this.logger.warn(`Embedding page ${page.id} failed: ${err.message}`),
        );
        opts.onProgress?.(++done);
      }
      cursor = pages[pages.length - 1].id;
    }

    cursor = null;
    for (;;) {
      const after = cursor;
      const attachments = await this.db
        .selectFrom('attachments')
        .select('id')
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .where('textContent', 'is not', null)
        .$if(!!after, (qb) => qb.where('id', '>', after))
        .orderBy('id')
        .limit(50)
        .execute();
      if (attachments.length === 0) break;
      for (const attachment of attachments) {
        await this.indexAttachment(attachment.id).catch((err) =>
          this.logger.warn(
            `Embedding attachment ${attachment.id} failed: ${err.message}`,
          ),
        );
        opts.onProgress?.(++done);
      }
      cursor = attachments[attachments.length - 1].id;
    }
  }

  // What the settings screen shows about the search index.
  async status(workspaceId: string) {
    const storage = await this.isStorageReady();
    const model = await this.aiProvider.embeddingModel(workspaceId);
    const counts = await this.aiQueue.getJobCounts(
      'active',
      'waiting',
      'delayed',
    );
    return {
      pgvector: storage,
      configured: !!model,
      model: model?.modelId ?? null,
      ...(storage ? await this.repo.stats(workspaceId) : {}),
      busy: counts.active + counts.waiting > 0,
    };
  }

  // Starts a full rebuild in the background.
  async queueRebuild(workspaceId: string, reset = true) {
    await this.aiQueue.add(
      QueueJob.EMBED_REBUILD,
      { workspaceId, reset },
      { jobId: `embed-rebuild-${workspaceId}`, attempts: 1 },
    );
  }
}
