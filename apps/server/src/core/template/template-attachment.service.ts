import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { v7 as uuid7 } from 'uuid';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Attachment } from '@docmost/db/types/entity.types';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { StorageService } from '../../integrations/storage/storage.service';
import {
  getAttachmentIds,
  isAttachmentNode,
} from '../../common/helpers/prosemirror/utils';

export type AttachmentOwner = { pageId: string } | { templateId: string };

export type AttachmentCopy = { source: Attachment; newId: string };

// Clones attachments between pages and templates, the same way
// PageService.duplicatePage copies them between pages.
@Injectable()
export class TemplateAttachmentService {
  private readonly logger = new Logger(TemplateAttachmentService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly storageService: StorageService,
  ) {}

  // Gives every attachment owned by `source` a new id inside `content`.
  // Attachments owned by anyone else are left untouched.
  async prepareClone(
    content: any,
    source: AttachmentOwner,
    workspaceId: string,
  ): Promise<{ content: any; copies: AttachmentCopy[] }> {
    if (!content) return { content, copies: [] };

    const ids = getAttachmentIds(content);
    if (ids.length === 0) return { content, copies: [] };

    let query = this.db
      .selectFrom('attachments')
      .selectAll()
      .where('id', 'in', ids)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);
    query =
      'pageId' in source
        ? query.where('pageId', '=', source.pageId)
        : query.where('templateId', '=', source.templateId);
    const owned = (await query.execute()) as Attachment[];
    if (owned.length === 0) return { content, copies: [] };

    const newIds = new Map(owned.map((a) => [a.id, uuid7()]));
    const cloned = structuredClone(content);
    rewriteAttachmentIds(cloned, newIds);

    return {
      content: cloned,
      copies: owned.map((source) => ({ source, newId: newIds.get(source.id) })),
    };
  }

  // Copies the files and creates the attachment rows for the new owner.
  async commitClone(
    copies: AttachmentCopy[],
    target: AttachmentOwner,
    spaceId: string | null,
  ): Promise<void> {
    for (const { source, newId } of copies) {
      const newFilePath = source.filePath.replace(source.id, newId);
      try {
        await this.storageService.copy(source.filePath, newFilePath);
        await this.attachmentRepo.insertAttachment({
          id: newId,
          type: source.type,
          filePath: newFilePath,
          fileName: source.fileName,
          fileSize: source.fileSize,
          mimeType: source.mimeType,
          fileExt: source.fileExt,
          creatorId: source.creatorId,
          workspaceId: source.workspaceId,
          pageId: 'pageId' in target ? target.pageId : null,
          templateId: 'templateId' in target ? target.templateId : null,
          spaceId,
        });
      } catch (err) {
        // keep going; one missing file should not block the rest
        this.logger.error(`Failed to clone attachment ${source.id}`, err);
      }
    }
  }

  // Storage cleanup for a template that is about to be deleted; the rows
  // themselves go away through the FK cascade.
  async deleteTemplateFiles(templateId: string): Promise<void> {
    const rows = await this.db
      .selectFrom('attachments')
      .select(['id', 'filePath'])
      .where('templateId', '=', templateId)
      .execute();

    for (const row of rows) {
      try {
        await this.storageService.delete(row.filePath);
      } catch (err) {
        this.logger.warn(`Failed to delete template file ${row.id}`, err);
      }
    }
  }
}

function rewriteAttachmentIds(node: any, newIds: Map<string, string>): void {
  if (!node || typeof node !== 'object') return;

  if (isAttachmentNode(node.type) && node.attrs?.attachmentId) {
    const oldId = node.attrs.attachmentId;
    const newId = newIds.get(oldId);
    if (newId) {
      node.attrs.attachmentId = newId;
      if (typeof node.attrs.src === 'string') {
        node.attrs.src = node.attrs.src.replace(oldId, newId);
      }
    }
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) rewriteAttachmentIds(child, newIds);
  }
}
