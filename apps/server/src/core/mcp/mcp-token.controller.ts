import {
  BadRequestException,
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
import { CreateMcpTokenDto, McpTokenIdDto } from './dto/mcp-token.dto';

// Tokens can only be managed from an interactive session, never with a token.
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('mcp-tokens')
export class McpTokenController {
  constructor(
    private readonly mcpTokenService: McpTokenService,
    private readonly environmentService: EnvironmentService,
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

    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Expiry date must be in the future');
      }
    }

    return this.mcpTokenService.create({
      name: dto.name.trim(),
      userId: user.id,
      workspaceId: workspace.id,
      expiresAt,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  async revoke(
    @Body() dto: McpTokenIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertEnabled();
    await this.mcpTokenService.revoke(dto.tokenId, user.id, workspace.id);
  }
}
