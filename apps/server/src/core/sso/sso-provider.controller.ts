import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { SsoProviderService } from './sso-provider.service';
import {
  CreateSsoProviderDto,
  SsoProviderIdDto,
  UpdateSsoProviderDto,
} from './dto/sso-provider.dto';

// Served at /api/sso-providers so it never collides with the enterprise /sso routes.
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('sso-providers')
export class SsoProviderController {
  constructor(
    private readonly ssoProviderService: SsoProviderService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user, workspace);
    return this.ssoProviderService.list(workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(
    @Body() dto: SsoProviderIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.ssoProviderService.get(dto.providerId, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @Body() dto: CreateSsoProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.ssoProviderService.create(dto, user.id, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(
    @Body() dto: UpdateSsoProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.ssoProviderService.update(dto, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(
    @Body() dto: SsoProviderIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    await this.ssoProviderService.remove(dto.providerId, workspace);
  }

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }
}
