import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SprintBootLinkService } from './sprint-boot-link.service';

const fetchMock = jest.fn();

jest.mock('../../../../common/proxy-fetch', () => ({
  proxyFetch: (...args: unknown[]) => fetchMock(...args),
}));

const SB = 'https://sprint.acme.com';
const user = { id: 'u1', email: 'admin@acme.com' } as any;
const workspace = { id: 'w1' } as any;

function create({ admin = true } = {}) {
  const store = new Map<string, string>();
  const redis = {
    set: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => void store.delete(key)),
  };
  const apiKeyService = { create: jest.fn(async () => ({ token: 'docmost-api-key' })) };
  const configService = { save: jest.fn(async () => ({})) };
  const integrationService = { installWithApiToken: jest.fn(async () => ({})) };
  const integrationRepo = { findByWorkspaceAndType: jest.fn(async () => undefined) };
  const spaceService = { createSpace: jest.fn(async (_u: any, _w: string, dto: any) => ({ id: 'space-new', ...dto })) };
  const spaceRepo = { slugExists: jest.fn(async () => false) };
  const service = new SprintBootLinkService(
    { getOrThrow: () => redis } as any,
    { getAppUrl: () => 'https://docs.acme.com/' } as any,
    apiKeyService as any,
    spaceService as any,
    { getUserSpaces: jest.fn(async () => ({ items: [{ id: 's1', name: 'Engineering', slug: 'eng' }] })) } as any,
    configService as any,
    integrationService as any,
    integrationRepo as any,
    { findById: jest.fn(async () => user) } as any,
    { findById: jest.fn(async () => workspace) } as any,
    spaceRepo as any,
    { createForUser: () => ({ cannot: () => !admin }) } as any,
  );
  return { service, store, apiKeyService, configService, integrationService, spaceService };
}

const stateOf = (authorizeUrl: string) => new URL(authorizeUrl).searchParams.get('state')!;

describe('SprintBootLinkService', () => {
  beforeEach(() => fetchMock.mockReset());

  it('sends the admin to Sprint Boot to authorize, with a one-time state', async () => {
    const { service } = create();
    const { authorizeUrl } = await service.start(user, workspace, `${SB}/api/v1/docs-bridge`);

    const url = new URL(authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${SB}/integrations/docmost/authorize`);
    expect(url.searchParams.get('docmostUrl')).toBe('https://docs.acme.com');
    expect(stateOf(authorizeUrl)).toMatch(/^[0-9a-f]{48}$/);
  });

  it('refuses anyone who cannot manage the workspace settings', async () => {
    const { service } = create({ admin: false });
    await expect(service.start(user, workspace, SB)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('installs the integration and hands Sprint Boot an API key once, when Sprint Boot authorizes', async () => {
    const { service, configService, integrationService } = create();
    const state = stateOf((await service.start(user, workspace, SB)).authorizeUrl);

    expect((await service.linkRequest(state)).spaces).toEqual([{ id: 's1', name: 'Engineering', slug: 'eng' }]);
    const answer = await service.completeFromSprintBoot(state, SB, 'sbd_secret');

    expect(answer.apiKey).toBe('docmost-api-key');
    expect(configService.save).toHaveBeenCalledWith(
      { type: 'sprint-boot', baseUrl: SB, clientSecret: 'sbd_secret' },
      'w1',
      'u1',
    );
    expect(integrationService.installWithApiToken).toHaveBeenCalledWith('sprint-boot', 'w1', 'u1');
    await expect(service.completeFromSprintBoot(state, SB, 'sbd_secret')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a completion from another Sprint Boot than the one the admin named', async () => {
    const { service } = create();
    const state = stateOf((await service.start(user, workspace, SB)).authorizeUrl);
    await expect(service.completeFromSprintBoot(state, 'https://evil.test', 'x')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('authorizes a link Sprint Boot started, creating the new space and installing with the secret it answers', async () => {
    const { service, configService, spaceService } = create();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ bridgeSecret: 'sbd_back', returnUrl: `${SB}/admin/integrations?linked=docmost` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const done = await service.authorize(user, workspace, {
      sprintBootUrl: SB,
      state: 'sb-state',
      spaceKey: 'SB',
      newSpaceName: 'Sprint Boot docs',
    });

    expect(spaceService.createSpace).toHaveBeenCalledWith(user, 'w1', expect.objectContaining({ name: 'Sprint Boot docs', slug: 'sprint-boot-docs' }));
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`${SB}/api/v1/docs-link/complete`);
    expect(JSON.parse(init.body)).toEqual({
      state: 'sb-state',
      docmostUrl: 'https://docs.acme.com',
      apiKey: 'docmost-api-key',
      spaceKey: 'SB',
      docmostSpaceId: 'space-new',
    });
    expect(configService.save).toHaveBeenCalledWith({ type: 'sprint-boot', baseUrl: SB, clientSecret: 'sbd_back' }, 'w1', 'u1');
    expect(done.returnUrl).toBe(`${SB}/admin/integrations?linked=docmost`);
  });
});
