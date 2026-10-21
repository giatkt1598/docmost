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
import { AiProviderService } from './ai-provider.service';
import { AiProviderAdminService } from './ai-provider-admin.service';
import {
  AiProviderConnectionDto,
  SaveAiProviderDto,
  TestAiProviderDto,
} from './dto/ai-provider.dto';

// The workspace's AI provider, managed by admins from AI settings.
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('ai-provider')
export class AiProviderController {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly admin: AiProviderAdminService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user, workspace);
    return this.aiProvider.describe(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('save')
  save(
    @Body() dto: SaveAiProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.admin.save(workspace.id, user.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  remove(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user, workspace);
    return this.admin.remove(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('models')
  models(
    @Body() dto: AiProviderConnectionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.admin.listModels(workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('test')
  test(
    @Body() dto: TestAiProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.admin.test(workspace.id, dto);
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
