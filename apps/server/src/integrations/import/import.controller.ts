import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import * as bytes from 'bytes';
import * as path from 'path';
import { ImportService } from './services/import.service';
import {
  PAGE_IMPORT_EXTENSIONS,
  PAGE_IMPORT_MAX_SIZE,
  ZIP_IMPORT_SOURCES,
} from './import.constants';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import {
  ApiDescription,
  ApiMultipartBody,
} from '../../core/api-docs/api-docs.decorators';
import { ImportWebPageDto } from './dto/import-web-page.dto';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { EnvironmentService } from '../environment/environment.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';

@Controller()
export class ImportController {
  private readonly logger = new Logger(ImportController.name);

  constructor(
    private readonly importService: ImportService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @UseInterceptors(FileInterceptor)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('pages/import')
  @OAuthScope('write')
  @ApiDescription(
    'Creates a page from one Markdown, HTML, Word or PDF file, at the root of the space or under parentPageId. The first heading becomes the title. Returns the new page. Send spaceId and parentPageId before the file part.',
  )
  @ApiMultipartBody({
    type: 'object',
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description: `${PAGE_IMPORT_EXTENSIONS.join(', ')}; max ${PAGE_IMPORT_MAX_SIZE}`,
      },
      spaceId: { type: 'string', format: 'uuid' },
      parentPageId: {
        type: 'string',
        description:
          'Page id or slug id to import under; the space root when absent',
      },
    },
    required: ['file', 'spaceId'],
  })
  async importPage(
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const validFileExtensions = PAGE_IMPORT_EXTENSIONS;

    const maxFileSize = bytes(PAGE_IMPORT_MAX_SIZE);

    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: maxFileSize, fields: 4, files: 1 },
      });
    } catch (err: any) {
      this.logger.error(err.message);
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${PAGE_IMPORT_MAX_SIZE} import limit`,
        );
      }
    }

    if (!file) {
      throw new BadRequestException('Failed to upload file');
    }

    if (
      !validFileExtensions.includes(path.extname(file.filename).toLowerCase())
    ) {
      throw new BadRequestException('Invalid import file type.');
    }

    const spaceId = file.fields?.spaceId?.value;

    if (!spaceId) {
      throw new BadRequestException('spaceId is required');
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const parentRef = file.fields?.parentPageId?.value;
    const parentPageId = parentRef
      ? await this.importService.resolveParentPage(parentRef, spaceId, user)
      : undefined;

    const createdPage = await this.importService.importPage(
      file,
      user.id,
      spaceId,
      workspace.id,
      parentPageId,
    );

    const ext = path.extname(file.filename).toLowerCase();
    const sourceMap: Record<string, string> = {
      '.md': 'markdown',
      '.html': 'html',
      '.docx': 'docx',
      '.pdf': 'pdf',
    };

    if (createdPage) {
      this.auditService.log({
        event: AuditEvent.PAGE_CREATED,
        resourceType: AuditResource.PAGE,
        resourceId: createdPage.id,
        spaceId,
        metadata: {
          source: sourceMap[ext],
          fileName: file.filename,
        },
      });
    }

    return createdPage;
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('pages/import-url')
  @OAuthScope('write')
  @ApiDescription(
    'Reads a public web page and creates a page at the root of the space or under parentPageId. mode "article" (default) keeps the main content; "full" keeps the whole page without menus and footers. Images are copied into Docmost shortly after. Returns the new page.',
  )
  async importWebPage(
    @Body() dto: ImportWebPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const parentPageId = dto.parentPageId
      ? await this.importService.resolveParentPage(
          dto.parentPageId,
          dto.spaceId,
          user,
        )
      : undefined;

    const createdPage = await this.importService.importWebPage(
      dto.url,
      dto.mode ?? 'article',
      user.id,
      dto.spaceId,
      workspace.id,
      parentPageId,
    );

    this.auditService.log({
      event: AuditEvent.PAGE_CREATED,
      resourceType: AuditResource.PAGE,
      resourceId: createdPage.id,
      spaceId: dto.spaceId,
      metadata: {
        source: 'web',
        url: dto.url,
      },
    });

    return createdPage;
  }

  @UseInterceptors(FileInterceptor)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('pages/import-zip')
  @OAuthScope('write')
  @ApiDescription(
    'Imports a zip of pages in the background: a folder of Markdown/HTML files (generic), a Notion export, or a Confluence HTML space export. Its top-level pages go to the space root or under parentPageId. Returns a file task; poll /api/file-tasks/info with its id until status is "success" or "failed". Send spaceId, source and parentPageId before the file part.',
  )
  @ApiMultipartBody({
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary', description: '.zip' },
      spaceId: { type: 'string', format: 'uuid' },
      source: { type: 'string', enum: [...ZIP_IMPORT_SOURCES] },
      parentPageId: {
        type: 'string',
        description:
          'Page id or slug id to import under; the space root when absent',
      },
    },
    required: ['file', 'spaceId', 'source'],
  })
  async importZip(
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const validFileExtensions = ['.zip'];

    const maxFileSize = bytes(this.environmentService.getFileImportSizeLimit());

    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: maxFileSize, fields: 4, files: 1 },
      });
    } catch (err: any) {
      this.logger.error(err.message);
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${this.environmentService.getFileImportSizeLimit()} import limit`,
        );
      }
    }

    if (!file) {
      throw new BadRequestException('Failed to upload file');
    }

    if (
      !validFileExtensions.includes(path.extname(file.filename).toLowerCase())
    ) {
      throw new BadRequestException('Invalid import file extension.');
    }

    const spaceId = file.fields?.spaceId?.value;
    const source = file.fields?.source?.value;

    if (!(ZIP_IMPORT_SOURCES as readonly string[]).includes(source)) {
      throw new BadRequestException(
        'Invalid import source. Import source must either be generic, notion or confluence.',
      );
    }

    if (!spaceId) {
      throw new BadRequestException('spaceId is required');
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const parentRef = file.fields?.parentPageId?.value;
    const parentPageId = parentRef
      ? await this.importService.resolveParentPage(parentRef, spaceId, user)
      : undefined;

    this.auditService.log({
      event: AuditEvent.PAGE_IMPORTED,
      resourceType: AuditResource.PAGE,
      resourceId: spaceId,
      spaceId,
      metadata: {
        fileName: file.filename,
        source,
        spaceId,
      },
    });

    return this.importService.importZip(
      file,
      source,
      user.id,
      spaceId,
      workspace.id,
      parentPageId,
    );
  }
}
