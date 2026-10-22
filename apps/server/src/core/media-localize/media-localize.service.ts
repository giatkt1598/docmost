import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { Attachment, Page } from '@docmost/db/types/entity.types';
import { AttachmentService } from '../attachment/services/attachment.service';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';
import { MediaReplacement } from '../../collaboration/collaboration.handler';
import { findExternalMedia, hasExternalMedia } from './external-media.util';
import {
  RemoteFileError,
  RemoteFileFetcher,
} from './remote-file-fetcher.service';

export type LocalizeMediaJob = { pageId: string };

const MAX_FILES_PER_RUN = 20;
const FAILED_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class MediaLocalizeService {
  private readonly logger = new Logger(MediaLocalizeService.name);
  private readonly redis: Redis;

  constructor(
    @InjectQueue(QueueName.MEDIA_QUEUE) private readonly mediaQueue: Queue,
    private readonly environmentService: EnvironmentService,
    private readonly pageRepo: PageRepo,
    private readonly userRepo: UserRepo,
    private readonly attachmentService: AttachmentService,
    private readonly collaborationGateway: CollaborationGateway,
    private readonly fetcher: RemoteFileFetcher,
    redisService: RedisService,
  ) {
    this.redis = redisService.getOrThrow();
  }

  private failedKey(url: string) {
    return `media-localize:failed:${createHash('sha256').update(url).digest('hex')}`;
  }

  async run(pageId: string, isLastAttempt: boolean): Promise<void> {
    const page = await this.pageRepo.findById(pageId, { includeContent: true });
    if (!page || page.deletedAt) return;

    const appUrl = this.environmentService.getAppUrl();
    const candidates = findExternalMedia(page.content, appUrl);
    const media = [];
    for (const item of candidates) {
      if (media.length >= MAX_FILES_PER_RUN) break;
      if (await this.redis.exists(this.failedKey(item.url))) continue;
      media.push(item);
    }
    if (media.length === 0) return;

    const userId = page.lastUpdatedById ?? page.creatorId;
    const user = userId
      ? await this.userRepo.findById(userId, page.workspaceId)
      : undefined;

    const saved: { replacement: MediaReplacement; attachment: Attachment }[] =
      [];
    let retryable = 0;

    for (const item of media) {
      try {
        const file = await this.fetcher.fetch(item.url, item.kind);
        const attachment = await this.attachmentService.saveRemoteFile({
          ...file,
          pageId: page.id,
          spaceId: page.spaceId,
          userId: user?.id ?? page.creatorId,
          workspaceId: page.workspaceId,
        });
        saved.push({
          attachment,
          replacement: {
            url: item.url,
            src: `/api/files/${attachment.id}/${attachment.fileName}`,
            attachmentId: attachment.id,
            size: Number(attachment.fileSize),
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
          },
        });
      } catch (err: any) {
        const canRetry = err instanceof RemoteFileError && err.retryable;
        if (canRetry && !isLastAttempt) {
          retryable++;
        } else {
          await this.redis.set(
            this.failedKey(item.url),
            '1',
            'EX',
            FAILED_TTL_SECONDS,
          );
        }
        this.logger.warn(
          `Could not copy ${item.url} for page ${pageId}: ${err?.message ?? err}`,
        );
      }
    }

    if (saved.length > 0) {
      await this.applyToPage(page, saved, user);
    }

    if (retryable > 0) {
      // BullMQ retries; files saved above are already in the page
      throw new Error(`${retryable} file(s) failed with a temporary error`);
    }
  }

  private async applyToPage(
    page: Page,
    saved: { replacement: MediaReplacement; attachment: Attachment }[],
    user: any,
  ) {
    // the page may have gone to the trash while we were downloading
    if (!(await this.isLive(page.id))) {
      await this.discard(saved.map((s) => s.attachment));
      return;
    }

    let counts: Record<string, number> = {};
    try {
      counts =
        (await this.collaborationGateway.handleYjsEvent(
          'localizeMedia',
          `page.${page.id}`,
          { replacements: saved.map((s) => s.replacement), user },
        )) ?? {};
    } catch (err) {
      await this.discard(saved.map((s) => s.attachment));
      throw err;
    }

    // removed from the page meanwhile: don't keep a file nothing shows
    const unused = saved
      .filter((s) => !counts[s.replacement.url])
      .map((s) => s.attachment);

    // deleted while we were writing: the page's delete job may already be done
    if (!(await this.isLive(page.id))) {
      await this.discard(saved.map((s) => s.attachment));
      return;
    }
    await this.discard(unused);

    this.logger.debug(
      `Copied ${saved.length - unused.length} external file(s) into page ${page.id}`,
    );
  }

  private async isLive(pageId: string) {
    const page = await this.pageRepo.findById(pageId);
    return !!page && !page.deletedAt;
  }

  private async discard(attachments: Attachment[]) {
    for (const attachment of attachments) {
      try {
        await this.attachmentService.deleteAttachment(attachment);
      } catch (err) {
        this.logger.error(`Failed to delete attachment ${attachment.id}`, err);
      }
    }
  }
}

// Queues a copy job when page content still points at external media. Kept
// free of the service's dependencies so collab and page code can call it.
export async function enqueueMediaLocalize(
  queue: Queue,
  environmentService: EnvironmentService,
  pageId: string,
  content: any,
  delayMs = 2000,
) {
  if (!environmentService.isMediaLocalizeEnabled()) return;
  if (!hasExternalMedia(content, environmentService.getAppUrl())) return;
  await queue.add(
    QueueJob.LOCALIZE_PAGE_MEDIA,
    { pageId } as LocalizeMediaJob,
    // collapse bursts of saves; an overlapping run is harmless because nodes
    // already pointing at a copy are skipped and unused copies are deleted
    {
      delay: delayMs,
      deduplication: { id: `localize-media-${pageId}`, ttl: 5000 },
    },
  );
}
