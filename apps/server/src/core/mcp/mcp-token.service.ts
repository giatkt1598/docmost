import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  McpTokenListItem,
  McpTokenRepo,
} from '@docmost/db/repos/mcp-token/mcp-token.repo';
import { McpToken, User, Workspace } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { UserRole } from '../../common/helpers/types/permission';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { CreateMcpTokenDto } from './dto/mcp-token.dto';

export const MCP_TOKEN_PREFIX = 'dmcp_';

// A token acts as its owner, so each user may hold only a few at once and
// none lives for more than a year.
export const MAX_ACTIVE_TOKENS_PER_USER = 10;
export const MAX_TOKEN_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateMcpToken(): string {
  return MCP_TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function isWorkspaceAdmin(user: Pick<User, 'role'>): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.OWNER;
}

export function mcpRestrictedToAdmins(workspace: Pick<Workspace, 'settings'>) {
  const settings = workspace.settings as {
    mcp?: { restrictToAdmins?: boolean };
  } | null;
  return settings?.mcp?.restrictToAdmins === true;
}

@Injectable()
export class McpTokenService {
  constructor(
    private readonly mcpTokenRepo: McpTokenRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService?: IAuditService,
  ) {}

  // the plaintext token is returned only here and never persisted
  async create(opts: {
    name: string;
    userId: string;
    workspaceId: string;
    expiresAt?: Date | null;
  }): Promise<{ token: string; mcpToken: McpTokenListItem }> {
    const token = generateMcpToken();
    const mcpToken = await this.mcpTokenRepo.insert({
      name: opts.name,
      tokenHash: hashMcpToken(token),
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      expiresAt: opts.expiresAt ?? null,
    });
    return { token, mcpToken };
  }

  // A token for the signed-in user, within the workspace's limits.
  async createForUser(
    user: User,
    workspace: Workspace,
    dto: CreateMcpTokenDto,
  ) {
    if (mcpRestrictedToAdmins(workspace) && !isWorkspaceAdmin(user)) {
      throw new ForbiddenException(
        'MCP access is restricted to workspace admins',
      );
    }

    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      const lifetime = expiresAt.getTime() - Date.now();
      if (lifetime <= 0) {
        throw new BadRequestException('Expiry date must be in the future');
      }
      if (lifetime > MAX_TOKEN_LIFETIME_MS) {
        throw new BadRequestException(
          'Expiry date can be at most one year ahead',
        );
      }
    }

    const active = await this.mcpTokenRepo.countActiveByUser(
      user.id,
      workspace.id,
    );
    if (active >= MAX_ACTIVE_TOKENS_PER_USER) {
      throw new BadRequestException(
        `You can have at most ${MAX_ACTIVE_TOKENS_PER_USER} active MCP tokens. Revoke one first.`,
      );
    }

    const created = await this.create({
      name: dto.name.trim(),
      userId: user.id,
      workspaceId: workspace.id,
      expiresAt,
    });
    this.audit(AuditEvent.MCP_TOKEN_CREATED, created.mcpToken, {
      name: created.mcpToken.name,
    });
    return created;
  }

  async list(userId: string, workspaceId: string) {
    return this.mcpTokenRepo.listByUser(userId, workspaceId);
  }

  // every token of the workspace, for the admin management page
  async listAll(
    user: User,
    workspace: Workspace,
    pagination: PaginationOptions,
  ) {
    if (!isWorkspaceAdmin(user)) throw new ForbiddenException();
    return this.mcpTokenRepo.listByWorkspace(workspace.id, pagination);
  }

  // Owners revoke their own tokens; admins can revoke anyone's.
  async revoke(tokenId: string, user: User, workspace: Workspace) {
    const admin = isWorkspaceAdmin(user);
    const token = await this.mcpTokenRepo.findById(tokenId, workspace.id);
    if (!token || (!admin && token.userId !== user.id)) {
      throw new NotFoundException('Token not found');
    }
    const revoked = await this.mcpTokenRepo.revoke(
      tokenId,
      admin ? null : user.id,
      workspace.id,
    );
    if (revoked === 0) {
      throw new NotFoundException('Token not found');
    }
    this.audit(AuditEvent.MCP_TOKEN_REVOKED, token, {
      name: token.name,
      revokedByOwner: token.userId === user.id,
    });
  }

  async findActive(token: string): Promise<McpToken | undefined> {
    if (!token?.startsWith(MCP_TOKEN_PREFIX)) {
      return undefined;
    }
    return this.mcpTokenRepo.findActiveByHash(hashMcpToken(token));
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    await this.mcpTokenRepo.touchLastUsed(tokenId);
  }

  private audit(
    event:
      | typeof AuditEvent.MCP_TOKEN_CREATED
      | typeof AuditEvent.MCP_TOKEN_REVOKED,
    token: McpTokenListItem,
    metadata: Record<string, unknown>,
  ) {
    this.auditService?.log({
      event,
      resourceType: AuditResource.MCP_TOKEN,
      resourceId: token.id,
      metadata: { ownerId: token.userId, ...metadata },
    });
  }
}
