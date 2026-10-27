import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import {
  extractBearerTokenFromHeader,
  isUserDisabled,
} from '../../common/helpers';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  isWorkspaceAdmin,
  McpTokenService,
  mcpRestrictedToAdmins,
} from './mcp-token.service';

export const MCP_AUTH_TYPE = 'mcp_token';

// Authenticates personal MCP tokens; deliberately separate from JwtStrategy.
@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly logger = new Logger(McpAuthGuard.name);

  constructor(
    private readonly mcpTokenService: McpTokenService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly environmentService: EnvironmentService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.environmentService.isMcpServerEnabled()) {
      throw new NotFoundException();
    }

    const req = context.switchToHttp().getRequest();
    const token = extractBearerTokenFromHeader(req);
    if (!token) {
      throw new UnauthorizedException('Missing MCP token');
    }

    const mcpToken = await this.mcpTokenService.findActive(token);
    if (!mcpToken) {
      throw new UnauthorizedException('Invalid or expired MCP token');
    }

    if (req.raw?.workspaceId && req.raw.workspaceId !== mcpToken.workspaceId) {
      throw new UnauthorizedException('Workspace does not match');
    }

    const workspace = await this.workspaceRepo.findById(mcpToken.workspaceId);
    if (!workspace) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepo.findById(
      mcpToken.userId,
      mcpToken.workspaceId,
    );
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    // admins can switch MCP off for members; their tokens stop working
    if (mcpRestrictedToAdmins(workspace) && !isWorkspaceAdmin(user)) {
      throw new UnauthorizedException(
        'MCP access is restricted to workspace admins',
      );
    }

    this.mcpTokenService
      .touchLastUsed(mcpToken.id)
      .catch((err) =>
        this.logger.warn(`Failed to update MCP token usage: ${err.message}`),
      );

    // same shape JwtStrategy produces, so AuthUser and audit context work
    req.user = { user, workspace, authType: MCP_AUTH_TYPE };
    return true;
  }
}
