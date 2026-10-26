import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Readable } from 'stream';
import { v7 } from 'uuid';
import { imageDimensionsFromData } from 'image-dimensions';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../storage/storage.service';
import { getAttachmentFolderPath } from '../../../core/attachment/attachment.utils';
import { AttachmentType } from '../../../core/attachment/attachment.constants';

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const MIN_SIDE = 32;
const MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_WIDTH = 600;

export type ImportedImage = {
  attachmentId: string;
  src: string;
  width: number;
  height?: number;
};

// Images found inside an imported DOCX or PDF become attachments of the page
// that is about to be created (its id is chosen up front by the importer).
@Injectable()
export class ImportImageService {
  private readonly logger = new Logger(ImportImageService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
  ) {}

  // Null for formats the editor cannot show and for decorative slivers.
  async saveImage(opts: {
    buffer: Buffer;
    contentType: string;
    workspaceId: string;
    spaceId: string;
    pageId: string;
    userId: string;
  }): Promise<ImportedImage | null> {
    const ext = EXTENSIONS[opts.contentType?.toLowerCase()];
    if (!ext || opts.buffer.length === 0 || opts.buffer.length > MAX_BYTES) {
      return null;
    }

    const size = imageDimensionsFromData(new Uint8Array(opts.buffer));
    if (size && (size.width < MIN_SIDE || size.height < MIN_SIDE)) return null;

    const attachmentId = v7();
    const fileName = `image${ext}`;
    const storagePath = `${getAttachmentFolderPath(
      AttachmentType.File,
      opts.workspaceId,
    )}/${attachmentId}/${fileName}`;

    try {
      await this.storageService.uploadStream(
        storagePath,
        Readable.from(opts.buffer),
        { recreateClient: true },
      );
      await this.db
        .insertInto('attachments')
        .values({
          id: attachmentId,
          filePath: storagePath,
          fileName,
          fileSize: opts.buffer.length,
          mimeType: opts.contentType,
          type: 'file',
          fileExt: ext,
          creatorId: opts.userId,
          workspaceId: opts.workspaceId,
          pageId: opts.pageId,
          spaceId: opts.spaceId,
        })
        .execute();
    } catch (err) {
      this.logger.warn(
        `Could not save an imported image: ${(err as Error).message}`,
      );
      return null;
    }

    return {
      attachmentId,
      src: `/api/files/${attachmentId}/${fileName}`,
      // the editor lays images out by width; very wide ones are scaled down
      width: Math.min(size?.width ?? DEFAULT_WIDTH, 1200),
      height: size
        ? Math.round((size.height / size.width) * Math.min(size.width, 1200))
        : undefined,
    };
  }
}

export function imageHtml(image: ImportedImage): string {
  return (
    `<img src="${image.src}" data-attachment-id="${image.attachmentId}"` +
    ` width="${image.width}"` +
    (image.height ? ` height="${image.height}"` : '') +
    ` data-align="center">`
  );
}
