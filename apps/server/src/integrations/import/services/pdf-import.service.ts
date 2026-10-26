import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { markdownToHtml } from '@docmost/editor-ext';
import { ImportImageService, imageHtml } from './import-image.service';

const MAX_PAGES = 500;
const MAX_IMAGES = 200;
const TIMEOUT_MS = 60_000;

type PdfImage = { page: number; y: number; data: Buffer };
type PdfExtraction = {
  pageCount: number;
  pagesNeedingOcr: number[];
  pages: { page: number; markdown: string; needsOcr: boolean }[];
  images: PdfImage[];
};

// The native PDF routines are synchronous and a large file would stall every
// request, so they run in a worker thread.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
try {
  const pdf = require(workerData.module);
  const buffer = Buffer.from(workerData.bytes);
  const classification = pdf.classifyPdf(buffer);
  if (classification.pageCount > workerData.maxPages) {
    parentPort.postMessage({ ok: false, tooLong: classification.pageCount });
  } else {
    const result = pdf.extractPagesMarkdown(buffer);
    let images = [];
    try {
      images = pdf.extractImages(buffer).map((i) => ({ page: i.page, y: i.y, data: i.data }));
    } catch (e) {}
    parentPort.postMessage({
      ok: true,
      pageCount: classification.pageCount,
      pagesNeedingOcr: classification.pagesNeedingOcr,
      pages: result.pages,
      images,
    });
  }
} catch (e) {
  parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
}
`;

// PDF to HTML. Text, headings, tables and columns come from the PDF's own
// text layer; there is no OCR, so scanned documents are refused. Embedded
// JPEG images become attachments of the new page.
@Injectable()
export class PdfImportService {
  private readonly logger = new Logger(PdfImportService.name);

  constructor(private readonly images: ImportImageService) {}

  private extract(buffer: Buffer): Promise<PdfExtraction> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: {
          module: require.resolve('@docmost/pdf-inspector'),
          bytes: new Uint8Array(buffer),
          maxPages: MAX_PAGES,
        },
      });
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new BadRequestException('The PDF took too long to process.'));
      }, TIMEOUT_MS);

      worker.once('message', (message) => {
        clearTimeout(timer);
        void worker.terminate();
        if (message.ok) {
          resolve({
            ...message,
            images: message.images.map((i: PdfImage) => ({
              ...i,
              data: Buffer.from(i.data),
            })),
          });
        } else if (message.tooLong) {
          reject(
            new BadRequestException(
              `The PDF has ${message.tooLong} pages; the limit is ${MAX_PAGES}.`,
            ),
          );
        } else {
          this.logger.warn(`PDF extraction failed: ${message.error}`);
          reject(
            new BadRequestException(
              'The PDF could not be read. Make sure it is a valid, unencrypted PDF.',
            ),
          );
        }
      });
      worker.once('error', (err) => {
        clearTimeout(timer);
        this.logger.warn(`PDF worker failed: ${(err as Error).message}`);
        reject(new BadRequestException('The PDF could not be read.'));
      });
    });
  }

  async convertPdfToHtml(
    buffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const extraction = await this.extract(buffer);

    const unreadable = new Set(extraction.pagesNeedingOcr);
    if (extraction.pageCount > 0 && unreadable.size >= extraction.pageCount) {
      throw new BadRequestException(
        'This PDF is a scan without a text layer. Importing scanned PDFs (OCR) is not supported.',
      );
    }
    if (unreadable.size > 0) {
      this.logger.warn(
        `${unreadable.size} PDF page(s) have no readable text and were skipped`,
      );
    }

    // images by page, top to bottom, up to the limit
    const imagesByPage = new Map<number, string[]>();
    let saved = 0;
    const ordered = [...extraction.images].sort(
      (a, b) => a.page - b.page || a.y - b.y,
    );
    for (const image of ordered) {
      if (saved >= MAX_IMAGES) break;
      const result = await this.images.saveImage({
        buffer: image.data,
        contentType: 'image/jpeg',
        workspaceId,
        spaceId,
        pageId,
        userId,
      });
      if (!result) continue;
      saved++;
      const list = imagesByPage.get(image.page) ?? [];
      list.push(imageHtml(result));
      imagesByPage.set(image.page, list);
    }

    const blocks: string[] = [];
    for (const page of [...extraction.pages].sort((a, b) => a.page - b.page)) {
      const text = page.markdown?.trim() ?? '';
      if (text) blocks.push(text);
      // pdf-inspector pages are 0-indexed, extracted images 1-indexed
      for (const html of imagesByPage.get(page.page + 1) ?? []) {
        blocks.push(html);
      }
    }

    const markdown = blocks.join('\n\n');
    if (!markdown.trim()) {
      throw new BadRequestException('The PDF has no text to import.');
    }
    return markdownToHtml(markdown);
  }
}
