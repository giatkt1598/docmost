import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BaseService } from './base.service';
import { BasePropertyService } from './base-property.service';
import { BaseRowService } from './base-row.service';
import { BaseViewService } from './base-view.service';
import { BaseExportService } from './base-export.service';
import { BaseReferenceService } from './base-reference.service';
import { BaseRowPageService } from './base-row-page.service';
import { BaseCsvImportService } from './base-csv-import.service';
import {
  BasePageDto,
  ConvertBaseDto,
  CreateBaseDto,
  CreatePropertyDto,
  CreateRowDto,
  CreateViewDto,
  DeletePropertyDto,
  DeleteRowDto,
  DeleteRowsDto,
  DeleteViewDto,
  ExpandPagesDto,
  ExportBaseCsvDto,
  ListBasesDto,
  ListRowsDto,
  ReorderPropertyDto,
  ReorderRowDto,
  RestoreRowsDto,
  RowInfoDto,
  RowPageDto,
  UpdateBaseDto,
  UpdatePropertyDto,
  UpdateRowDto,
  UpdateViewDto,
} from './dto/base.dto';

const CSV_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

@UseGuards(JwtAuthGuard)
@Controller('bases')
export class BaseController {
  constructor(
    private readonly baseService: BaseService,
    private readonly propertyService: BasePropertyService,
    private readonly rowService: BaseRowService,
    private readonly viewService: BaseViewService,
    private readonly exportService: BaseExportService,
    private readonly referenceService: BaseReferenceService,
    private readonly rowPageService: BaseRowPageService,
    private readonly csvImportService: BaseCsvImportService,
  ) {}

  // ---- bases -------------------------------------------------------------

  @HttpCode(HttpStatus.OK)
  @Post()
  @OAuthScope('read')
  list(
    @Body() dto: ListBasesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.list(dto.spaceId, user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @OAuthScope('write')
  create(
    @Body() dto: CreateBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.create(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  @OAuthScope('read')
  info(
    @Body() dto: BasePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.info(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  @OAuthScope('write')
  update(
    @Body() dto: UpdateBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.update(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  @OAuthScope('write')
  async delete(
    @Body() dto: BasePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.remove(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('convert')
  @OAuthScope('write')
  convert(
    @Body() dto: ConvertBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.convert(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('export-csv')
  @OAuthScope('read')
  async exportCsv(
    @Body() dto: ExportBaseCsvDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const { page } = await this.baseService.getViewablePage(
      dto.pageId,
      user,
      workspace,
    );
    const { filename, stream } = await this.exportService.exportCsv(
      page,
      dto.filter,
      user,
    );
    res.headers({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    res.send(stream);
  }

  // multipart: pageId and createMissing fields, then the .csv file
  @HttpCode(HttpStatus.OK)
  @Post('import-csv')
  @OAuthScope('write')
  async importCsv(
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    let file: any = null;
    try {
      file = await req.file({
        limits: { fileSize: CSV_IMPORT_MAX_BYTES, fields: 3, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException('The CSV file is larger than 20 MB');
      }
      throw new BadRequestException('Failed to read the uploaded file');
    }
    if (!file) throw new BadRequestException('A CSV file is required');
    if (!/\.csv$/i.test(file.filename ?? '')) {
      throw new BadRequestException('Only .csv files can be imported');
    }
    const pageId = file.fields?.pageId?.value;
    if (typeof pageId !== 'string' || !pageId) {
      throw new BadRequestException('pageId is required');
    }
    const createMissing = file.fields?.createMissing?.value === 'true';

    const page = await this.baseService.getEditablePage(pageId, user, workspace);
    const buffer: Buffer = await file.toBuffer();
    if (file.file?.truncated) {
      throw new BadRequestException('The CSV file is larger than 20 MB');
    }
    return this.csvImportService.importCsv(page, buffer, { createMissing }, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('pages/expand')
  @OAuthScope('read')
  async expandPages(
    @Body() dto: ExpandPagesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const items = await this.referenceService.expandPages(
      dto.pageIds,
      user,
      workspace.id,
    );
    return { items };
  }

  // ---- properties --------------------------------------------------------

  @HttpCode(HttpStatus.OK)
  @Post('properties/create')
  @OAuthScope('write')
  async createProperty(
    @Body() dto: CreatePropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    return this.propertyService.create(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/update')
  @OAuthScope('write')
  async updateProperty(
    @Body() dto: UpdatePropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    return this.propertyService.update(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/delete')
  @OAuthScope('write')
  async deleteProperty(
    @Body() dto: DeletePropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    await this.propertyService.delete(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/reorder')
  @OAuthScope('write')
  async reorderProperty(
    @Body() dto: ReorderPropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    await this.propertyService.reorder(page, dto, user);
  }

  // ---- rows --------------------------------------------------------------

  @HttpCode(HttpStatus.OK)
  @Post('rows')
  @OAuthScope('read')
  async listRows(
    @Body() dto: ListRowsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const { page } = await this.baseService.getViewablePage(dto.pageId, user, workspace);
    return this.rowService.list(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/info')
  @OAuthScope('read')
  async rowInfo(
    @Body() dto: RowInfoDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const { page } = await this.baseService.getViewablePage(dto.pageId, user, workspace);
    return this.rowService.info(page, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/create')
  @OAuthScope('write')
  async createRow(
    @Body() dto: CreateRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    return this.rowService.create(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/update')
  @OAuthScope('write')
  async updateRow(
    @Body() dto: UpdateRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    return this.rowService.update(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete')
  @OAuthScope('write')
  async deleteRow(
    @Body() dto: DeleteRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    await this.rowService.delete(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete-many')
  @OAuthScope('write')
  async deleteRows(
    @Body() dto: DeleteRowsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    await this.rowService.deleteMany(page, dto, user);
  }

  // The row's own page, created on first use (needs edit access then).
  @HttpCode(HttpStatus.OK)
  @Post('rows/page')
  @OAuthScope('write')
  rowPage(
    @Body() dto: RowPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.rowPageService.open(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/restore')
  @OAuthScope('write')
  async restoreRows(
    @Body() dto: RestoreRowsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    return this.rowService.restoreMany(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/reorder')
  @OAuthScope('write')
  async reorderRow(
    @Body() dto: ReorderRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    await this.rowService.reorder(page, dto, user);
  }

  // ---- views -------------------------------------------------------------

  @HttpCode(HttpStatus.OK)
  @Post('views')
  @OAuthScope('read')
  async listViews(
    @Body() dto: BasePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const { page } = await this.baseService.getViewablePage(dto.pageId, user, workspace);
    return this.viewService.list(page);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/create')
  @OAuthScope('write')
  async createView(
    @Body() dto: CreateViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    return this.viewService.create(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/update')
  @OAuthScope('write')
  async updateView(
    @Body() dto: UpdateViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    return this.viewService.update(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/delete')
  @OAuthScope('write')
  async deleteView(
    @Body() dto: DeleteViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.baseService.getEditablePage(dto.pageId, user, workspace);
    await this.viewService.delete(page, dto, user);
  }
}
