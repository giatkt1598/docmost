import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { MultipartFile } from '@fastify/multipart';
import * as path from 'path';
import {
  htmlToJson,
  jsonToText,
  tiptapExtensions,
} from '../../../collaboration/collaboration.util';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  generateSlugId,
  sanitizeFileName,
  createByteCountingStream,
} from '../../../common/helpers';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import { markdownToHtml } from '@docmost/editor-ext';
import {
  FileTaskStatus,
  FileTaskType,
  getFileTaskFolderPath,
} from '../utils/file.utils';
import { v7 as uuid7 } from 'uuid';
import { StorageService } from '../../storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../queue/constants';
import { DocxImportService } from './docx-import.service';
import { PdfImportService } from './pdf-import.service';
import { load } from 'cheerio';
import { normalizeImportHtml } from '../utils/import-formatter';
import {
  extractWebPage,
  MIN_ARTICLE_TEXT,
  WebPageMode,
} from '../utils/web-page-html';
import { WebPageError, WebPageFetcher } from './web-page-fetcher.service';
import { EnvironmentService } from '../../environment/environment.service';
import { enqueueMediaLocalize } from '../../../core/media-localize/media-localize.queue';

function webPageErrorMessage(err: WebPageError): string {
  if (err.status === 401 || err.status === 403) {
    return 'The website refused access (it may require a login or block automated readers).';
  }
  if (err.status === 404 || err.status === 410) {
    return 'The page was not found (HTTP 404).';
  }
  if (err.status) return `The website returned an error (HTTP ${err.status}).`;
  if (err.message.startsWith('Blocked address')) {
    return 'This address cannot be imported.';
  }
  if (err.message.startsWith('Not a web page')) {
    return 'The link does not point to a web page.';
  }
  if (err.message === 'The page is too large')
    return 'The page is too large to import.';
  return 'Could not reach the website.';
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.FILE_TASK_QUEUE)
    private readonly fileTaskQueue: Queue,
    private readonly docxImport: DocxImportService,
    private readonly pdfImport: PdfImportService,
    private readonly webPageFetcher: WebPageFetcher,
    private readonly environmentService: EnvironmentService,
    @InjectQueue(QueueName.MEDIA_QUEUE) private readonly mediaQueue: Queue,
  ) {}

  async importPage(
    filePromise: Promise<MultipartFile>,
    userId: string,
    spaceId: string,
    workspaceId: string,
  ) {
    const file = await filePromise;
    const fileBuffer = await file.toBuffer();
    const fileExtension = path.extname(file.filename).toLowerCase();
    const fileName = sanitizeFileName(
      path.basename(file.filename, fileExtension),
    );
    const fileContent = fileBuffer.toString();

    let prosemirrorState = null;
    let createdPage = null;

    // For DOCX, we need the page ID upfront so images can reference it
    const pageId =
      fileExtension === '.docx' || fileExtension === '.pdf'
        ? uuid7()
        : undefined;

    try {
      if (fileExtension.endsWith('.md')) {
        prosemirrorState = await this.processMarkdown(fileContent);
      } else if (fileExtension.endsWith('.html')) {
        prosemirrorState = await this.processHTML(fileContent);
      } else if (fileExtension.endsWith('.docx')) {
        prosemirrorState = await this.processDocx(
          fileBuffer,
          workspaceId,
          spaceId,
          pageId,
          userId,
        );
      } else if (fileExtension.endsWith('.pdf')) {
        prosemirrorState = await this.processPdf(
          fileBuffer,
          workspaceId,
          spaceId,
          pageId,
          userId,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const message = 'Error processing file content';
      this.logger.error(message, err);
      throw new BadRequestException(message);
    }

    if (!prosemirrorState) {
      const message = 'Failed to create ProseMirror state';
      this.logger.error(message);
      throw new BadRequestException(message);
    }

    const { title, prosemirrorJson } = this.extractTitleAndRemoveHeading(
      prosemirrorState,
      { anyHeadingLevel: true },
    );

    const pageTitle = title || fileName;

    if (prosemirrorJson) {
      createdPage = await this.createImportedPage({
        pageId,
        title: pageTitle,
        prosemirrorJson,
        userId,
        spaceId,
        workspaceId,
      });

      this.logger.debug(
        `Successfully imported "${title}${fileExtension}. ID: ${createdPage.id} - SlugId: ${createdPage.slugId}"`,
      );
    }

    return createdPage;
  }

  async importWebPage(
    url: string,
    mode: WebPageMode,
    userId: string,
    spaceId: string,
    workspaceId: string,
  ) {
    let page;
    try {
      const fetched = await this.webPageFetcher.fetchHtml(url);
      page = extractWebPage(fetched.html, fetched.finalUrl, mode);

      // little text usually means the page is rendered by JavaScript
      if (
        page.textLength < MIN_ARTICLE_TEXT &&
        this.webPageFetcher.isBrowserEnabled()
      ) {
        const rendered = await this.webPageFetcher
          .renderHtml(fetched.finalUrl)
          .catch((err) => {
            this.logger.warn(`Rendering ${url} failed: ${err?.message}`);
            return null;
          });
        if (rendered) {
          const renderedPage = extractWebPage(
            rendered.html,
            rendered.finalUrl,
            mode,
          );
          if (renderedPage.textLength > page.textLength) page = renderedPage;
        }
      }
    } catch (err) {
      if (err instanceof WebPageError) {
        throw new BadRequestException(webPageErrorMessage(err));
      }
      this.logger.error(`Failed to read web page ${url}`, err);
      throw new BadRequestException('Could not read the web page');
    }

    if (!page.textLength && !page.imageCount) {
      throw new BadRequestException(
        'No readable content found on this page. It may need a login or be rendered by JavaScript.',
      );
    }

    const sourceLink = load('<p><a></a></p>', null, false);
    sourceLink('a').attr('href', url).text(url);

    let prosemirrorState;
    try {
      prosemirrorState = await this.processHTML(page.html + sourceLink.html());
    } catch (err) {
      this.logger.error('Failed to convert web page', err);
      throw new BadRequestException('Error processing web page content');
    }

    // Readability usually drops the heading that repeats the title; when the
    // page still starts with it, keep it as the title instead of in the body
    const content = prosemirrorState.content ?? [];
    let title = page.title;
    const first = content[0];
    if (first?.type === 'heading') {
      const headingText = (first.content ?? [])
        .map((node: any) => node.text ?? '')
        .join('')
        .trim();
      if (headingText && (!title || title.includes(headingText))) {
        title = headingText;
        content.shift();
      }
    }
    if (content.length === 0) content.push({ type: 'paragraph', content: [] });

    const prosemirrorJson = { ...prosemirrorState, content };
    const createdPage = await this.createImportedPage({
      title: (title || new URL(url).hostname).slice(0, 250),
      prosemirrorJson,
      userId,
      spaceId,
      workspaceId,
    });

    // copy the page's images into our storage, as pasting would
    await enqueueMediaLocalize(
      this.mediaQueue,
      this.environmentService,
      createdPage.id,
      prosemirrorJson,
    ).catch((err) =>
      this.logger.warn(
        `Failed to queue media copy for page ${createdPage.id}: ${err}`,
      ),
    );

    return createdPage;
  }

  private async createImportedPage(opts: {
    pageId?: string;
    title: string;
    prosemirrorJson: any;
    userId: string;
    spaceId: string;
    workspaceId: string;
  }) {
    const { pageId, title, prosemirrorJson, userId, spaceId, workspaceId } =
      opts;
    try {
      const pagePosition = await this.getNewPagePosition(spaceId);

      return await this.pageRepo.insertPage({
        ...(pageId ? { id: pageId } : {}),
        slugId: generateSlugId(),
        title,
        content: prosemirrorJson,
        textContent: jsonToText(prosemirrorJson),
        ydoc: await this.createYdoc(prosemirrorJson),
        position: pagePosition,
        spaceId: spaceId,
        creatorId: userId,
        workspaceId: workspaceId,
        lastUpdatedById: userId,
      });
    } catch (err) {
      const message = 'Failed to create imported page';
      this.logger.error(message, err);
      throw new BadRequestException(message);
    }
  }

  async processMarkdown(markdownInput: string): Promise<any> {
    try {
      const html = await markdownToHtml(markdownInput);
      return this.processHTML(html);
    } catch (err) {
      throw err;
    }
  }

  async processHTML(htmlInput: string): Promise<any> {
    try {
      const $ = load(htmlInput);
      normalizeImportHtml($, $.root());
      return htmlToJson($.html() || '');
    } catch (err) {
      throw err;
    }
  }

  async processDocx(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<any> {
    const html = await this.docxImport.convertDocxToHtml(
      fileBuffer,
      workspaceId,
      spaceId,
      pageId,
      userId,
    );

    return this.processHTML(html);
  }

  async processPdf(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<any> {
    const html = await this.pdfImport.convertPdfToHtml(
      fileBuffer,
      workspaceId,
      spaceId,
      pageId,
      userId,
    );

    return this.processHTML(html);
  }

  async createYdoc(prosemirrorJson: any): Promise<Buffer | null> {
    if (prosemirrorJson) {
      // this.logger.debug(`Converting prosemirror json state to ydoc`);

      const ydoc = TiptapTransformer.toYdoc(
        prosemirrorJson,
        'default',
        tiptapExtensions,
      );

      Y.encodeStateAsUpdate(ydoc);

      return Buffer.from(Y.encodeStateAsUpdate(ydoc));
    }
    return null;
  }

  extractTitleAndRemoveHeading(
    prosemirrorState: any,
    opts?: { anyHeadingLevel?: boolean },
  ) {
    let title: string | null = null;

    const content = prosemirrorState.content ?? [];
    const firstNode = content[0];

    const isTitleHeading =
      firstNode?.type === 'heading' &&
      (opts?.anyHeadingLevel || firstNode.attrs?.level === 1);

    if (isTitleHeading) {
      const headingText = (firstNode.content ?? [])
        .map((node: any) => node.text ?? '')
        .join('')
        .trim();

      if (headingText) {
        title = headingText;
        content.shift();
      }
    }

    // ensure at least one paragraph
    if (content.length === 0) {
      content.push({
        type: 'paragraph',
        content: [],
      });
    }

    return {
      title,
      prosemirrorJson: {
        ...prosemirrorState,
        content,
      },
    };
  }

  async getNewPagePosition(
    spaceId: string,
    parentPageId?: string,
  ): Promise<string> {
    let query = this.db
      .selectFrom('pages')
      .select(['id', 'position'])
      .where('spaceId', '=', spaceId)
      .orderBy('position', (ob) => ob.collate('C').desc())
      .limit(1);

    if (parentPageId) {
      query = query.where('parentPageId', '=', parentPageId);
    } else {
      query = query.where('parentPageId', 'is', null);
    }

    const lastPage = await query.executeTakeFirst();

    if (lastPage) {
      return generateJitteredKeyBetween(lastPage.position, null);
    } else {
      return generateJitteredKeyBetween(null, null);
    }
  }

  async importZip(
    filePromise: Promise<MultipartFile>,
    source: string,
    userId: string,
    spaceId: string,
    workspaceId: string,
  ) {
    const file = await filePromise;
    const fileExtension = path.extname(file.filename).toLowerCase();
    const fileName = sanitizeFileName(
      path.basename(file.filename, fileExtension),
    );
    const fileNameWithExt = fileName + fileExtension;

    const fileTaskId = uuid7();
    const filePath = `${getFileTaskFolderPath(FileTaskType.Import, workspaceId)}/${fileTaskId}/${fileNameWithExt}`;

    // upload file
    const { stream, getBytesRead } = createByteCountingStream(file.file);

    await this.storageService.upload(filePath, stream);

    const fileSize = getBytesRead();

    const fileTask = await this.db
      .insertInto('fileTasks')
      .values({
        id: fileTaskId,
        type: FileTaskType.Import,
        source: source,
        status: FileTaskStatus.Processing,
        fileName: fileNameWithExt,
        filePath: filePath,
        fileSize: fileSize,
        fileExt: 'zip',
        creatorId: userId,
        spaceId: spaceId,
        workspaceId: workspaceId,
      })
      .returningAll()
      .executeTakeFirst();

    await this.fileTaskQueue.add(QueueJob.IMPORT_TASK, {
      fileTaskId: fileTaskId,
    });

    return fileTask;
  }
}
