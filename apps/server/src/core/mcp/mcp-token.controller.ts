import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { McpTokenService } from './mcp-token.service';
import { McpService } from './mcp.service';
import {
  CreateMcpTokenDto,
  ListMcpTokensDto,
  McpTokenIdDto,
} from './dto/mcp-token.dto';

// Tokens can only be managed from an interactive session, never with a token.
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('mcp-tokens')
export class McpTokenController {
  constructor(
    private readonly mcpTokenService: McpTokenService,
    private readonly environmentService: EnvironmentService,
    private readonly mcpService: McpService,
  ) {}

  private assertEnabled() {
    if (!this.environmentService.isMcpServerEnabled()) {
      throw new NotFoundException('MCP server is not enabled');
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info() {
    return { enabled: this.environmentService.isMcpServerEnabled() };
  }

  // the tools a token of this user would get, for the documentation page
  @HttpCode(HttpStatus.OK)
  @Post('tools')
  async tools(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertEnabled();
    return { tools: await this.mcpService.listTools({ user, workspace }) };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertEnabled();
    return this.mcpTokenService.list(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreateMcpTokenDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertEnabled();
    return this.mcpTokenService.createForUser(user, workspace, dto);
  }

  // every member's tokens, for admins
  @HttpCode(HttpStatus.OK)
  @Post('all')
  async listAll(
    @Body() dto: ListMcpTokensDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertEnabled();
    return this.mcpTokenService.listAll(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  async revoke(
    @Body() dto: McpTokenIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertEnabled();
    await this.mcpTokenService.revoke(dto.tokenId, user, workspace);
  }
}
