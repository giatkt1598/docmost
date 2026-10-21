import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';

const member = { id: 'u1', role: 'member', workspaceId: 'ws' } as any;
const admin = { id: 'a1', role: 'admin', workspaceId: 'ws' } as any;
const open = { id: 'ws', settings: {} } as any;
const restricted = { id: 'ws', settings: { api: { restrictToAdmins: true } } };

function setup(opts: { key?: any; user?: any; workspace?: any } = {}) {
  const repo = {
    insert: jest.fn(async (row) => ({ id: 'k1', ...row })),
    findById: jest.fn().mockResolvedValue(opts.key),
    update: jest.fn(async (_id, _ws, row) => ({ ...opts.key, ...row })),
    softDelete: jest.fn(),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ items: [] }),
  };
  const tokens = { generateApiToken: jest.fn().mockResolvedValue('jwt') };
  const service = new ApiKeyService(
    repo as any,
    { findById: jest.fn().mockResolvedValue(opts.user ?? member) } as any,
    { findById: jest.fn().mockResolvedValue(opts.workspace ?? open) } as any,
    tokens as any,
    { log: jest.fn() } as any,
  );
  return { service, repo, tokens };
}

const payload = {
  sub: 'u1',
  apiKeyId: 'k1',
  workspaceId: 'ws',
  type: 'api_key',
} as any;
const activeKey = {
  id: 'k1',
  creatorId: 'u1',
  workspaceId: 'ws',
  expiresAt: null,
};

describe('ApiKeyService.create', () => {
  it('returns the token once, signed until the expiry date', async () => {
    const { service, tokens } = setup();
    const expiresAt = new Date(Date.now() + 30 * 864e5).toISOString();

    const created = await service.create(member, open, {
      name: 'CI',
      expiresAt,
    });

    expect(created.token).toBe('jwt');
    const { expiresIn } = tokens.generateApiToken.mock.calls[0][0];
    expect(expiresIn).toBeGreaterThan(30 * 86400 - 5);
    expect(expiresIn).toBeLessThanOrEqual(30 * 86400);
  });

  it('allows keys without expiry', async () => {
    const { service, tokens } = setup();
    await service.create(member, open, { name: 'CI' });
    expect(tokens.generateApiToken.mock.calls[0][0]).not.toHaveProperty(
      'expiresIn',
    );
  });

  it('rejects past dates and more than a year', async () => {
    const { service } = setup();
    await expect(
      service.create(member, open, {
        name: 'x',
        expiresAt: '2000-01-01T00:00:00Z',
      }),
    ).rejects.toThrow('in the future');
    await expect(
      service.create(member, open, {
        name: 'x',
        expiresAt: new Date(Date.now() + 400 * 864e5).toISOString(),
      }),
    ).rejects.toThrow('one year');
  });

  it('only admins create keys while API access is restricted', async () => {
    const { service } = setup();
    await expect(
      service.create(member, restricted as any, { name: 'x' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.create(admin, restricted as any, { name: 'x' }),
    ).resolves.toBeTruthy();
  });
});

describe('ApiKeyService.validateApiKey', () => {
  it('returns the creator and workspace', async () => {
    const { service, repo } = setup({ key: activeKey });
    await expect(service.validateApiKey(payload)).resolves.toEqual({
      user: member,
      workspace: open,
    });
    expect(repo.touchLastUsed).toHaveBeenCalledWith('k1');
  });

  it.each([
    ['revoked or unknown', { key: undefined }],
    [
      'expired',
      { key: { ...activeKey, expiresAt: new Date(Date.now() - 1000) } },
    ],
    ['owned by someone else', { key: { ...activeKey, creatorId: 'other' } }],
    [
      'of a deactivated user',
      { key: activeKey, user: { ...member, deactivatedAt: new Date() } },
    ],
    ['of a member while restricted', { key: activeKey, workspace: restricted }],
  ])('rejects a key %s', async (_label, opts) => {
    const { service } = setup(opts as any);
    await expect(service.validateApiKey(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('keeps admin keys working while restricted', async () => {
    const { service } = setup({
      key: { ...activeKey, creatorId: 'a1' },
      user: admin,
      workspace: restricted,
    });
    await expect(
      service.validateApiKey({ ...payload, sub: 'a1' }),
    ).resolves.toBeTruthy();
  });
});

describe('ApiKeyService management', () => {
  it('members only see and manage their own keys', async () => {
    const { service, repo } = setup({
      key: { ...activeKey, creatorId: 'other' },
    });

    await expect(service.list(member, open, true, {} as any)).rejects.toThrow(
      ForbiddenException,
    );
    await service.list(member, open, false, {} as any);
    expect(repo.list.mock.calls[0][0]).toEqual({
      workspaceId: 'ws',
      creatorId: 'u1',
    });

    await expect(service.revoke(member, open, 'k1')).rejects.toThrow(
      'not found',
    );
    await service.revoke(admin, open, 'k1');
    expect(repo.softDelete).toHaveBeenCalledWith('k1', 'ws');
  });
});
