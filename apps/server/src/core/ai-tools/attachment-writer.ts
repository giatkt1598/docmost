import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import * as path from 'node:path';
import { v7 } from 'uuid';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../integrations/storage/storage.service';
import { getAttachmentFolderPath } from '../attachment/attachment.utils';
import { AttachmentType } from '../attachment/attachment.constants';
import { sanitizeFileName } from '../../common/helpers';
import { AttachmentRef } from './blocks/doc-blocks';

// Saves a file the AI tools produced or downloaded as an attachment of a
// page, the way uploads are stored.
@Injectable()
export class AttachmentWriter {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storage: StorageService,
  ) {}

  async save(opts: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    page: { id: string; spaceId: string; workspaceId: string };
    userId: string;
  }): Promise<AttachmentRef> {
    const ext = path.extname(opts.fileName).toLowerCase();
    const base = sanitizeFileName(path.basename(opts.fileName, ext)) || 'file';
    const fileName = `${base}${ext}`;
    const id = v7();
    const filePath = `${getAttachmentFolderPath(
      AttachmentType.File,
      opts.page.workspaceId,
    )}/${id}/${fileName}`;

    await this.storage.upload(filePath, opts.buffer);
    await this.db
      .insertInto('attachments')
      .values({
        id,
        filePath,
        fileName,
        fileSize: opts.buffer.length,
        mimeType: opts.mimeType,
        type: 'file',
        fileExt: ext,
        creatorId: opts.userId,
        workspaceId: opts.page.workspaceId,
        pageId: opts.page.id,
        spaceId: opts.page.spaceId,
      })
      .execute();

    return {
      id,
      fileName,
      mimeType: opts.mimeType,
      fileSize: opts.buffer.length,
    };
  }
}
