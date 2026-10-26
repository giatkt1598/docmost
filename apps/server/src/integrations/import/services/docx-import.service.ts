import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { load } from 'cheerio';
import { ImportImageService } from './import-image.service';

const MAX_IMAGES = 200;

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Block Text'] => blockquote > p:fresh",
  'strike => s',
];

// Word documents to HTML (mammoth): headings, lists, tables, formatting,
// links and footnotes; embedded images become attachments of the new page.
@Injectable()
export class DocxImportService {
  private readonly logger = new Logger(DocxImportService.name);

  constructor(private readonly images: ImportImageService) {}

  async convertDocxToHtml(
    buffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth');

    let saved = 0;
    const convertImage = mammoth.images.imgElement(async (image: any) => {
      // formats the editor cannot show come back empty and are dropped below
      if (saved >= MAX_IMAGES) return { src: '' };
      const data: Buffer = await image.read();
      const result = await this.images.saveImage({
        buffer: data,
        contentType: image.contentType,
        workspaceId,
        spaceId,
        pageId,
        userId,
      });
      if (!result) return { src: '' };
      saved++;
      return {
        src: result.src,
        'data-attachment-id': result.attachmentId,
        width: String(result.width),
        ...(result.height && { height: String(result.height) }),
        'data-align': 'center',
      };
    });

    let converted: { value: string; messages: { message: string }[] };
    try {
      converted = await mammoth.convertToHtml(
        { buffer },
        { convertImage, styleMap: STYLE_MAP, ignoreEmptyParagraphs: true },
      );
    } catch (err) {
      this.logger.warn(`DOCX conversion failed: ${(err as Error).message}`);
      throw new BadRequestException(
        'The Word file could not be read. Make sure it is a valid .docx document.',
      );
    }

    for (const message of converted.messages) {
      this.logger.debug(`DOCX import: ${message.message}`);
    }

    const $ = load(converted.value);
    $('img').each((_, el) => {
      if (!$(el).attr('src')) $(el).remove();
    });
    // an image alone in its paragraph is a block image
    $('p').each((_, el) => {
      const p = $(el);
      if (p.children().length === 1 && p.children('img').length === 1) {
        if (!p.text().trim()) p.replaceWith(p.children('img'));
      }
    });
    const html = $('body').html() ?? '';
    if (!html.trim()) {
      throw new BadRequestException('The Word file has no content to import.');
    }
    return html;
  }
}
