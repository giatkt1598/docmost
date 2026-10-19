import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  McpTokenListItem,
  McpTokenRepo,
} from '@docmost/db/repos/mcp-token/mcp-token.repo';
import { McpToken } from '@docmost/db/types/entity.types';

export const MCP_TOKEN_PREFIX = 'dmcp_';

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateMcpToken(): string {
  return MCP_TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

@Injectable()
export class McpTokenService {
  constructor(private readonly mcpTokenRepo: McpTokenRepo) {}

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

  async list(userId: string, workspaceId: string) {
    return this.mcpTokenRepo.listByUser(userId, workspaceId);
  }

  async revoke(tokenId: string, userId: string, workspaceId: string) {
    const revoked = await this.mcpTokenRepo.revoke(
      tokenId,
      userId,
      workspaceId,
    );
    if (revoked === 0) {
      throw new NotFoundException('Token not found');
    }
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
}
