import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PageAccessService } from '../page-access/page-access.service';
import { PagePermissionService } from './page-permission.service';
import {
  AddPagePermissionDto,
  PagePermissionListDto,
  PagePermissionPageDto,
  RemovePagePermissionDto,
  UpdatePagePermissionRoleDto,
} from './dto/page-permission.dto';

// Viewing the settings needs read access; changing them needs edit access
// to the page (writer on the nearest restricted page, if any).
@UseGuards(JwtAuthGuard)
@Controller('page-permissions')
export class PagePermissionController {
  constructor(
    private readonly pagePermissionService: PagePermissionService,
    private readonly pageAccessService: PageAccessService,
    private readonly pageRepo: PageRepo,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findPage(dto.pageId, workspace);
    return this.pagePermissionService.info(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  async list(
    @Body() dto: PagePermissionListDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findPage(dto.pageId, workspace);
    await this.pageAccessService.validateCanView(page, user);
    return this.pagePermissionService.list(page, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  async restrict(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findManageablePage(dto.pageId, user, workspace);
    await this.pagePermissionService.restrict(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unrestrict')
  async unrestrict(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findManageablePage(dto.pageId, user, workspace);
    await this.pagePermissionService.unrestrict(page);
  }

  @HttpCode(HttpStatus.OK)
  @Post('add')
  async add(
    @Body() dto: AddPagePermissionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findManageablePage(dto.pageId, user, workspace);
    await this.pagePermissionService.addPermissions(dto, page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  async remove(
    @Body() dto: RemovePagePermissionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findManageablePage(dto.pageId, user, workspace);
    await this.pagePermissionService.removePermissions(dto, page);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-role')
  async updateRole(
    @Body() dto: UpdatePagePermissionRoleDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.findManageablePage(dto.pageId, user, workspace);
    await this.pagePermissionService.updateRole(dto, page);
  }

  private async findPage(pageId: string, workspace: Workspace) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async findManageablePage(
    pageId: string,
    user: User,
    workspace: Workspace,
  ) {
    const page = await this.findPage(pageId, workspace);
    await this.pageAccessService.validateCanEdit(page, user);
    return page;
  }
}
