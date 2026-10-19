import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageVerificationService } from './page-verification.service';
import {
  CreatePageVerificationDto,
  ListPageVerificationsDto,
  PageVerificationPageIdDto,
  UpdatePageVerificationDto,
} from './dto/page-verification.dto';

// Served at /api/page-verifications so it never collides with the enterprise /pages/*-verification routes.
@UseGuards(JwtAuthGuard)
@Controller('page-verifications')
export class PageVerificationController {
  constructor(
    private readonly pageVerificationService: PageVerificationService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  @OAuthScope('read')
  async info(
    @Body() dto: PageVerificationPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageVerificationService.getInfo(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @OAuthScope('write')
  async create(
    @Body() dto: CreatePageVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageVerificationService.create(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  @OAuthScope('write')
  async update(
    @Body() dto: UpdatePageVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageVerificationService.update(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  @OAuthScope('write')
  async remove(
    @Body() dto: PageVerificationPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.pageVerificationService.remove(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  @OAuthScope('write')
  async verify(
    @Body() dto: PageVerificationPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageVerificationService.verify(dto.pageId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  @OAuthScope('read')
  async list(
    @Body() dto: ListPageVerificationsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageVerificationService.list(dto, user, workspace);
  }
}
