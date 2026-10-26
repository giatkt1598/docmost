import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../integrations/storage/storage.service';
import { EmbeddingIndexService } from './embedding-index.service';

const INDEXABLE_EXTENSIONS = ['.pdf', '.docx', '.txt'];
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;

// Postgres rejects NUL characters and PDFs love them.
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

export function isIndexableExtension(fileExt: string): boolean {
  return INDEXABLE_EXTENSIONS.includes((fileExt ?? '').toLowerCase());
}

// Extracts the text of PDF, DOCX and TXT attachments so they can be found by
// full-text and semantic search. The text lands in attachments.text_content;
// the tsvector is derived from it by a trigger.
@Injectable()
export class AttachmentTextService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttachmentTextService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storage: StorageService,
    private readonly embeddings: EmbeddingIndexService,
  ) {}

  // Files uploaded before indexing existed get their text once the server is
  // up, without anyone having to ask.
  onApplicationBootstrap() {
    void this.indexAllMissing().catch((err) =>
      this.logger.warn(`Attachment backfill failed: ${err.message}`),
    );
  }

  private async indexAllMissing() {
    const workspaces = await this.db
      .selectFrom('attachments')
      .select('workspaceId')
      .distinct()
      .where('deletedAt', 'is', null)
      .where('textContent', 'is', null)
      .where('pageId', 'is not', null)
      .where((eb) =>
        eb(eb.fn('lower', ['fileExt']), 'in', INDEXABLE_EXTENSIONS),
      )
      .execute();
    for (const { workspaceId } of workspaces) {
      const done = await this.indexMissing(workspaceId);
      if (done > 0) {
        this.logger.log(`Extracted text of ${done} attachments`);
      }
    }
  }

  async extract(buffer: Buffer, fileExt: string): Promise<string> {
    switch (fileExt.toLowerCase()) {
      case '.pdf': {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { extractText } = require('@docmost/pdf-inspector');
        return cleanExtractedText(extractText(buffer));
      }
      case '.docx': {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require('mammoth');
        const { value } = await mammoth.extractRawText({ buffer });
        return cleanExtractedText(value);
      }
      case '.txt':
        return cleanExtractedText(buffer.toString('utf8'));
      default:
        return '';
    }
  }

  async indexAttachment(attachmentId: string): Promise<void> {
    const attachment = await this.db
      .selectFrom('attachments')
      .select(['id', 'filePath', 'fileExt', 'fileSize', 'deletedAt'])
      .where('id', '=', attachmentId)
      .executeTakeFirst();
    if (
      !attachment ||
      attachment.deletedAt ||
      !isIndexableExtension(attachment.fileExt)
    ) {
      return;
    }
    if (Number(attachment.fileSize ?? 0) > MAX_FILE_BYTES) {
      this.logger.debug(`Attachment ${attachmentId} is too large to index`);
      return;
    }

    const buffer = await this.storage.read(attachment.filePath);
    let text = '';
    try {
      text = await this.extract(buffer, attachment.fileExt);
    } catch (err) {
      // unreadable file: record it as empty so it is not retried on every start
      this.logger.warn(
        `Could not read the text of attachment ${attachmentId}: ${(err as Error).message}`,
      );
    }

    await this.db
      .updateTable('attachments')
      .set({ textContent: text })
      .where('id', '=', attachmentId)
      .execute();

    await this.embeddings.scheduleAttachment(attachmentId);
  }

  // Attachments of a workspace that were uploaded before indexing existed.
  async indexMissing(workspaceId: string): Promise<number> {
    let done = 0;
    let cursor: string | null = null;
    for (;;) {
      const after = cursor;
      const batch = await this.db
        .selectFrom('attachments')
        .select(['id', 'fileExt'])
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .where('textContent', 'is', null)
        .where('pageId', 'is not', null)
        .$if(!!after, (qb) => qb.where('id', '>', after))
        .orderBy('id')
        .limit(50)
        .execute();
      if (batch.length === 0) break;
      for (const attachment of batch) {
        if (!isIndexableExtension(attachment.fileExt)) continue;
        await this.indexAttachment(attachment.id).catch((err) =>
          this.logger.warn(
            `Indexing attachment ${attachment.id} failed: ${err.message}`,
          ),
        );
        done++;
      }
      cursor = batch[batch.length - 1].id;
    }
    return done;
  }
}
