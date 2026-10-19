import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { McpAuthGuard, MCP_AUTH_TYPE } from './mcp-auth.guard';

const mcpToken = { id: 'tok_1', userId: 'user_1', workspaceId: 'ws_1' };

function createCtx(req: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

function request(authorization?: string, workspaceId = 'ws_1') {
  return {
    headers: authorization ? { authorization } : {},
    raw: { workspaceId },
  } as any;
}

function createGuard(opts: { enabled?: boolean; user?: any } = {}) {
  const mcpTokenService = {
    findActive: jest.fn(async (token: string) =>
      token === 'dmcp_valid' ? mcpToken : undefined,
    ),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
  } as any;
  const userRepo = {
    findById: jest.fn().mockResolvedValue(opts.user ?? { id: 'user_1' }),
  } as any;
  const workspaceRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'ws_1' }),
  } as any;
  const environmentService = {
    isMcpServerEnabled: jest.fn().mockReturnValue(opts.enabled ?? true),
  } as any;
  const guard = new McpAuthGuard(
    mcpTokenService,
    userRepo,
    workspaceRepo,
    environmentService,
  );
  return { guard, mcpTokenService };
}

describe('McpAuthGuard', () => {
  it('returns 404 when the MCP server is disabled', async () => {
    const { guard } = createGuard({ enabled: false });
    await expect(
      guard.canActivate(createCtx(request('Bearer dmcp_valid'))),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a missing token', async () => {
    const { guard } = createGuard();
    await expect(guard.canActivate(createCtx(request()))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown, revoked or expired token', async () => {
    const { guard } = createGuard();
    await expect(
      guard.canActivate(createCtx(request('Bearer dmcp_other'))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token from another workspace', async () => {
    const { guard } = createGuard();
    await expect(
      guard.canActivate(createCtx(request('Bearer dmcp_valid', 'ws_2'))),
    ).rejects.toThrow('Workspace does not match');
  });

  it('rejects a deactivated user', async () => {
    const { guard } = createGuard({
      user: { id: 'user_1', deactivatedAt: new Date() },
    });
    await expect(
      guard.canActivate(createCtx(request('Bearer dmcp_valid'))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the user and workspace for a valid token', async () => {
    const { guard, mcpTokenService } = createGuard();
    const req = request('Bearer dmcp_valid');

    await expect(guard.canActivate(createCtx(req))).resolves.toBe(true);
    expect(req.user).toEqual({
      user: { id: 'user_1' },
      workspace: { id: 'ws_1' },
      authType: MCP_AUTH_TYPE,
    });
    expect(mcpTokenService.touchLastUsed).toHaveBeenCalledWith('tok_1');
  });
});
