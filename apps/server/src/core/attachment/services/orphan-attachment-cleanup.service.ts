import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../../integrations/storage/storage.service';
import { AttachmentType } from '../attachment.constants';

const BATCH_SIZE = 500;
// leave files alone while an upload or import may still be creating the page
const MIN_AGE_MS = 60 * 60 * 1000;

// Safety net for page files whose page no longer exists, e.g. when a delete
// job failed or a background copy finished after the page was purged.
@Injectable()
export class OrphanAttachmentCleanupService {
  private readonly logger = new Logger(OrphanAttachmentCleanupService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
  ) {}

  @Interval('orphan-attachment-cleanup', 24 * 60 * 60 * 1000)
  async cleanup(): Promise<number> {
    let total = 0;
    try {
      while (true) {
        const orphans = await this.findOrphans(BATCH_SIZE);
        if (orphans.length === 0) break;

        let deleted = 0;
        for (const attachment of orphans) {
          try {
            await this.storageService.delete(attachment.filePath);
            await this.db
              .deleteFrom('attachments')
              .where('id', '=', attachment.id)
              .execute();
            deleted++;
          } catch (err) {
            this.logger.warn(
              `Failed to delete orphaned attachment ${attachment.id}: ${err}`,
            );
          }
        }
        total += deleted;
        // stop rather than loop on rows that keep failing
        if (deleted === 0 || orphans.length < BATCH_SIZE) break;
      }
      if (total > 0) {
        this.logger.log(`Deleted ${total} orphaned page attachment(s)`);
      }
    } catch (err) {
      this.logger.error('Orphaned attachment cleanup failed', err);
    }
    return total;
  }

  findOrphans(limit: number) {
    return this.db
      .selectFrom('attachments as a')
      .select(['a.id', 'a.filePath'])
      .where('a.type', '=', AttachmentType.File)
      .where('a.pageId', 'is not', null)
      .where('a.createdAt', '<', new Date(Date.now() - MIN_AGE_MS))
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('pages as p')
              .select('p.id')
              .whereRef('p.id', '=', 'a.pageId'),
          ),
        ),
      )
      .limit(limit)
      .execute();
  }
}
