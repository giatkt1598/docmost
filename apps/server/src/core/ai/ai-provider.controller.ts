import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
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
import { EmbeddingIndexService } from '../embedding/embedding-index.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AiProviderConnectionDto,
  SaveAiProviderDto,
  TestAiProviderDto,
  TestEmbeddingDto,
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
    private readonly embeddings: EmbeddingIndexService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user, workspace);
    return this.aiProvider.describe(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('save')
  async save(
    @Body() dto: SaveAiProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    const saved = await this.admin.save(workspace.id, user.id, dto);
    this.auditService.log({
      event: AuditEvent.AI_PROVIDER_UPDATED,
      resourceType: AuditResource.AI_PROVIDER,
      resourceId: workspace.id,
      // field names only: the DTO carries the provider API key
      metadata: { fields: Object.keys(dto) },
    });
    return saved;
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user, workspace);
    const result = await this.admin.remove(workspace.id);
    this.auditService.log({
      event: AuditEvent.AI_PROVIDER_DELETED,
      resourceType: AuditResource.AI_PROVIDER,
      resourceId: workspace.id,
    });
    return result;
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

  @HttpCode(HttpStatus.OK)
  @Post('test-embedding')
  testEmbedding(
    @Body() dto: TestEmbeddingDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.admin.testEmbedding(workspace.id, dto);
  }

  // State of the semantic search index.
  @HttpCode(HttpStatus.OK)
  @Post('search-index')
  searchIndex(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user, workspace);
    return this.embeddings.status(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('search-index/rebuild')
  async rebuildSearchIndex(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    await this.embeddings.queueRebuild(workspace.id, true);
    return this.embeddings.status(workspace.id);
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
