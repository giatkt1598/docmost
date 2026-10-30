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
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsDto, UpdateAuditRetentionDto } from './dto/audit.dto';

@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  list(
    @Body() dto: ListAuditLogsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.auditLogService.list(workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('retention')
  getRetention(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertCanManage(user, workspace);
    return this.auditLogService.getRetention(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('retention/update')
  updateRetention(
    @Body() dto: UpdateAuditRetentionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.auditLogService.updateRetention(
      workspace.id,
      dto.auditRetentionDays,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete-all')
  deleteAll(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertCanManage(user, workspace);
    return this.auditLogService.deleteAll(workspace.id);
  }

  private assertCanManage(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }
  }
}
