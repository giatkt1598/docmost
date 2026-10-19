import { NotFoundException } from '@nestjs/common';
import {
  generateMcpToken,
  hashMcpToken,
  MCP_TOKEN_PREFIX,
  McpTokenService,
} from './mcp-token.service';

function createService() {
  const repo = {
    insert: jest.fn(async (row) => ({ id: 'tok_1', name: row.name })),
    findActiveByHash: jest.fn(),
    listByUser: jest.fn(),
    revoke: jest.fn(),
    touchLastUsed: jest.fn(),
  } as any;
  return { service: new McpTokenService(repo), repo };
}

describe('McpTokenService', () => {
  it('generates prefixed, unique tokens', () => {
    const a = generateMcpToken();
    const b = generateMcpToken();
    expect(a.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
    expect(a).not.toEqual(b);
  });

  it('stores only the hash and returns the plaintext once', async () => {
    const { service, repo } = createService();

    const { token } = await service.create({
      name: 'Claude',
      userId: 'user_1',
      workspaceId: 'ws_1',
    });

    const stored = repo.insert.mock.calls[0][0];
    expect(stored.tokenHash).toEqual(hashMcpToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.expiresAt).toBeNull();
  });

  it('looks tokens up by hash', async () => {
    const { service, repo } = createService();
    repo.findActiveByHash.mockResolvedValue({ id: 'tok_1' });
    const token = generateMcpToken();

    await expect(service.findActive(token)).resolves.toEqual({ id: 'tok_1' });
    expect(repo.findActiveByHash).toHaveBeenCalledWith(hashMcpToken(token));
  });

  it('rejects tokens without the prefix without hitting the database', async () => {
    const { service, repo } = createService();

    await expect(service.findActive('eyJhbGciOi.jwt')).resolves.toBeUndefined();
    expect(repo.findActiveByHash).not.toHaveBeenCalled();
  });

  it('throws when revoking a token that is not the user’s', async () => {
    const { service, repo } = createService();
    repo.revoke.mockResolvedValue(0);

    await expect(service.revoke('tok_x', 'user_1', 'ws_1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
