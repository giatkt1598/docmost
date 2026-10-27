import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import * as path from 'node:path';
import * as bytes from 'bytes';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { ImportService } from '../../integrations/import/services/import.service';
import {
  PAGE_IMPORT_EXTENSIONS,
  PAGE_IMPORT_MAX_SIZE,
  ZIP_IMPORT_SOURCES,
} from '../../integrations/import/import.constants';
import { getPageTitle } from '../../common/helpers';
import { ToolActor } from '../ai-tools/ai-page-tools.service';
import { ToolDefinition } from '../ai-tools/tool-definition';
import {
  RemoteFileError,
  RemoteFileFetcher,
} from '../media-localize/remote-file-fetcher.service';

const FILE_SOURCE = {
  file_url: z
    .string()
    .url()
    .max(2048)
    .optional()
    .describe('Public URL to download the file from'),
  file_base64: z
    .string()
    .optional()
    .describe('The file itself, base64 encoded (for local files)'),
  file_name: z
    .string()
    .max(255)
    .optional()
    .describe(
      'File name with extension; required with file_base64, overrides the downloaded name with file_url',
    ),
};

const PARENT_PAGE = z
  .string()
  .min(1)
  .max(300)
  .optional()
  .describe(
    'Page id, slug id or page URL to import under; the space root when absent',
  );

type FileArgs = { file_url?: string; file_base64?: string; file_name?: string };

// The Import pages dialog over MCP: files, web pages and zip exports. MCP only;
// AI chat has no files to hand over.
@Injectable()
export class ImportToolsService {
  constructor(
    private readonly importService: ImportService,
    private readonly fetcher: RemoteFileFetcher,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  definitions(actor: ToolActor): ToolDefinition[] {
    return [
      {
        name: 'import_page',
        description:
          `Create a page in a space (at the root, or under parent_page_id) by importing a file or a web page. Files: Markdown, HTML, Word or PDF (${PAGE_IMPORT_EXTENSIONS.join(', ')}; max ${PAGE_IMPORT_MAX_SIZE}), given as file_url or file_base64 + file_name. ` +
          'Web pages: web_url; web_mode "article" (default) keeps the main content, "full" the whole page without menus and footers. ' +
          'The first heading (or the web page title) becomes the page title. To write Markdown you already have, use create_page instead.',
        inputSchema: z.object({
          space_id: z.uuid(),
          parent_page_id: PARENT_PAGE,
          web_url: z
            .string()
            .url()
            .max(2048)
            .optional()
            .describe('Web page to read'),
          web_mode: z.enum(['article', 'full']).optional(),
          ...FILE_SOURCE,
        }),
        readOnly: false,
        run: (a) => this.importPage(actor, a),
      },
      {
        name: 'import_zip',
        description:
          'Import many pages from a .zip in the background, at the space root or under parent_page_id: a folder of Markdown/HTML files (source "generic"), a Notion export ("notion") or a Confluence HTML space export ("confluence"). ' +
          'Give the zip as file_url or file_base64 + file_name. Returns a task_id; poll get_import_task until status is "success" or "failed".',
        inputSchema: z.object({
          space_id: z.uuid(),
          parent_page_id: PARENT_PAGE,
          source: z.enum(ZIP_IMPORT_SOURCES),
          ...FILE_SOURCE,
        }),
        readOnly: false,
        run: (a) => this.importZip(actor, a),
      },
      {
        name: 'get_import_task',
        description:
          'Status of a zip import started with import_zip: "processing", "success" or "failed" (with error_message).',
        inputSchema: z.object({ task_id: z.uuid() }),
        readOnly: true,
        run: (a) => this.getImportTask(actor, a),
      },
    ];
  }

  async importPage(
    actor: ToolActor,
    args: FileArgs & {
      space_id: string;
      parent_page_id?: string;
      web_url?: string;
      web_mode?: 'article' | 'full';
    },
  ) {
    const sources = [args.web_url, args.file_url, args.file_base64].filter(
      Boolean,
    );
    if (sources.length !== 1) {
      throw new BadRequestException(
        'Give exactly one of web_url, file_url or file_base64',
      );
    }
    await this.assertCanImport(actor, args.space_id);
    const parentPageId = args.parent_page_id
      ? await this.importService.resolveParentPage(
          args.parent_page_id,
          args.space_id,
          actor.user,
        )
      : undefined;

    let page;
    let metadata: Record<string, string>;
    if (args.web_url) {
      page = await this.importService.importWebPage(
        args.web_url,
        args.web_mode ?? 'article',
        actor.user.id,
        args.space_id,
        actor.workspace.id,
        parentPageId,
      );
      metadata = { source: 'web', url: args.web_url };
    } else {
      const file = await this.readFile(args, bytes(PAGE_IMPORT_MAX_SIZE));
      const ext = path.extname(file.name).toLowerCase();
      if (!PAGE_IMPORT_EXTENSIONS.includes(ext)) {
        throw new BadRequestException(
          `Unsupported file type "${ext || file.name}". Supported: ${PAGE_IMPORT_EXTENSIONS.join(', ')}`,
        );
      }
      page = await this.importService.importPageFile(
        file.buffer,
        file.name,
        actor.user.id,
        args.space_id,
        actor.workspace.id,
        parentPageId,
      );
      metadata = { source: ext.slice(1), fileName: file.name };
    }

    this.auditService.log({
      event: AuditEvent.PAGE_CREATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata,
    });

    return {
      page_id: page.id,
      slug_id: page.slugId,
      title: getPageTitle(page.title),
      space_id: page.spaceId,
      parent_page_id: page.parentPageId ?? undefined,
    };
  }

  async importZip(
    actor: ToolActor,
    args: FileArgs & {
      space_id: string;
      parent_page_id?: string;
      source: (typeof ZIP_IMPORT_SOURCES)[number];
    },
  ) {
    if ([args.file_url, args.file_base64].filter(Boolean).length !== 1) {
      throw new BadRequestException(
        'Give exactly one of file_url or file_base64',
      );
    }
    await this.assertCanImport(actor, args.space_id);
    const parentPageId = args.parent_page_id
      ? await this.importService.resolveParentPage(
          args.parent_page_id,
          args.space_id,
          actor.user,
        )
      : undefined;

    const file = await this.readFile(
      args,
      bytes(this.environmentService.getFileImportSizeLimit()),
    );
    if (path.extname(file.name).toLowerCase() !== '.zip') {
      throw new BadRequestException('The file must be a .zip');
    }

    this.auditService.log({
      event: AuditEvent.PAGE_IMPORTED,
      resourceType: AuditResource.PAGE,
      resourceId: args.space_id,
      spaceId: args.space_id,
      metadata: {
        fileName: file.name,
        source: args.source,
        spaceId: args.space_id,
      },
    });

    const task = await this.importService.importZipFile(
      file.buffer,
      file.name,
      args.source,
      actor.user.id,
      args.space_id,
      actor.workspace.id,
      parentPageId,
    );
    return { task_id: task.id, status: task.status };
  }

  async getImportTask(actor: ToolActor, args: { task_id: string }) {
    const task = await this.importService.findFileTask(args.task_id);
    if (!task || !task.spaceId || task.workspaceId !== actor.workspace.id) {
      throw new NotFoundException('Import task not found');
    }
    const ability = await this.spaceAbility.createForUser(
      actor.user,
      task.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    return {
      task_id: task.id,
      status: task.status,
      error_message: task.errorMessage ?? undefined,
      file_name: task.fileName,
      source: task.source,
      space_id: task.spaceId,
      parent_page_id: task.pageId ?? undefined,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };
  }

  private async assertCanImport(actor: ToolActor, spaceId: string) {
    const ability = await this.spaceAbility.createForUser(actor.user, spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async readFile(
    args: FileArgs,
    maxBytes: number,
  ): Promise<{ buffer: Buffer; name: string }> {
    const tooLarge = () =>
      new BadRequestException(`File is larger than ${bytes(maxBytes)}`);

    if (args.file_base64) {
      if (!args.file_name) {
        throw new BadRequestException('file_name is required with file_base64');
      }
      // base64 is 4/3 the size of the data; refuse before decoding
      if (args.file_base64.length > Math.ceil((maxBytes * 4) / 3) + 4) {
        throw tooLarge();
      }
      const buffer = Buffer.from(args.file_base64, 'base64');
      if (buffer.length === 0) throw new BadRequestException('Empty file');
      return { buffer, name: path.basename(args.file_name) };
    }

    let file;
    try {
      file = await this.fetcher.fetch(args.file_url!, 'file');
    } catch (err) {
      if (err instanceof RemoteFileError) {
        throw new BadRequestException(`Download failed: ${err.message}`);
      }
      throw err;
    }
    if (file.buffer.length > maxBytes) throw tooLarge();
    return {
      buffer: file.buffer,
      name: args.file_name ? path.basename(args.file_name) : file.fileName,
    };
  }
}
