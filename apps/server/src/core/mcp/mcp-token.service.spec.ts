import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  generateMcpToken,
  hashMcpToken,
  MAX_ACTIVE_TOKENS_PER_USER,
  MCP_TOKEN_PREFIX,
  McpTokenService,
} from './mcp-token.service';

function createService() {
  const repo = {
    insert: jest.fn(async (row) => ({ id: 'tok_1', name: row.name })),
    findActiveByHash: jest.fn(),
    listByUser: jest.fn(),
    listByWorkspace: jest.fn(),
    findById: jest.fn(),
    countActiveByUser: jest.fn().mockResolvedValue(0),
    revoke: jest.fn(),
    touchLastUsed: jest.fn(),
  } as any;
  const audit = { log: jest.fn() } as any;
  return { service: new McpTokenService(repo, audit), repo, audit };
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

  describe('members and admins', () => {
    const member = { id: 'user_1', role: 'member' } as any;
    const admin = { id: 'admin_1', role: 'admin' } as any;
    const workspace = { id: 'ws_1', settings: null } as any;
    const restricted = {
      id: 'ws_1',
      settings: { mcp: { restrictToAdmins: true } },
    } as any;
    const future = (days: number) =>
      new Date(Date.now() + days * 86_400_000).toISOString();

    it('lets a member create a token and audits it', async () => {
      const { service, repo, audit } = createService();
      const { token } = await service.createForUser(member, workspace, {
        name: ' Codex ',
        expiresAt: future(30),
      });
      expect(token.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
      expect(repo.insert.mock.calls[0][0]).toMatchObject({
        name: 'Codex',
        userId: 'user_1',
        workspaceId: 'ws_1',
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'mcp_token.created' }),
      );
    });

    it('refuses members, not admins, when MCP is restricted to admins', async () => {
      const { service } = createService();
      await expect(
        service.createForUser(member, restricted, { name: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.createForUser(admin, restricted, { name: 'x' }),
      ).resolves.toBeDefined();
    });

    it('refuses past, too distant and too many', async () => {
      const { service, repo } = createService();
      await expect(
        service.createForUser(member, workspace, {
          name: 'x',
          expiresAt: future(-1),
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createForUser(member, workspace, {
          name: 'x',
          expiresAt: future(400),
        }),
      ).rejects.toThrow(/one year/);
      repo.countActiveByUser.mockResolvedValue(MAX_ACTIVE_TOKENS_PER_USER);
      await expect(
        service.createForUser(member, workspace, { name: 'x' }),
      ).rejects.toThrow(/at most/);
    });

    it('lists every token for admins only', async () => {
      const { service, repo } = createService();
      repo.listByWorkspace.mockResolvedValue({ items: [] });
      await expect(
        service.listAll(member, workspace, {} as any),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.listAll(admin, workspace, {} as any),
      ).resolves.toEqual({ items: [] });
    });

    it('lets owners revoke their own and admins anyone’s, hides others', async () => {
      const { service, repo, audit } = createService();
      repo.findById.mockResolvedValue({ id: 'tok_1', userId: 'user_1', name: 'n' });
      repo.revoke.mockResolvedValue(1);

      await service.revoke('tok_1', member, workspace);
      expect(repo.revoke).toHaveBeenLastCalledWith('tok_1', 'user_1', 'ws_1');

      await service.revoke('tok_1', admin, workspace);
      expect(repo.revoke).toHaveBeenLastCalledWith('tok_1', null, 'ws_1');
      expect(audit.log).toHaveBeenCalledTimes(2);

      const other = { id: 'user_2', role: 'member' } as any;
      await expect(service.revoke('tok_1', other, workspace)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when the token is gone', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(undefined);
      await expect(service.revoke('tok_x', member, workspace)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
