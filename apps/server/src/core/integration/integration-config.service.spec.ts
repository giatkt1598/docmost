import { BadRequestException } from '@nestjs/common';
import { IntegrationConfigService } from './integration-config.service';
import { OutboundUrlError } from '../../integrations/outbound/outbound-url.guard';
import { TokenInvalidError } from './registry/integration-provider.interface';

const workspaceId = 'w1';
const userId = 'u1';

const GITEA = { baseUrl: 'required', appRegistrationPath: '/settings' };
const definitions: Record<string, any> = {
  gitea: { type: 'gitea', oauth: {}, setup: GITEA },
  github: { type: 'github', oauth: {}, setup: { baseUrl: 'optional' } },
  linear: { type: 'linear', oauth: {}, setup: { baseUrl: 'none' } },
  legacy: { type: 'legacy', oauth: {}, hidden: true },
};

const providerMethods: Record<string, any> = {};

function build(existing?: Record<string, any>) {
  const configRepo = {
    findByWorkspaceAndType: jest.fn().mockResolvedValue(existing),
    findAllByWorkspace: jest.fn().mockResolvedValue(existing ? [existing] : []),
    upsert: jest.fn(async (values) => ({ id: 'cfg-1', ...values })),
  };
  const integrationRepo = {
    findByWorkspaceAndType: jest.fn().mockResolvedValue({ id: 'i1' }),
  };
  const connectionRepo = {
    deleteByIntegration: jest.fn().mockResolvedValue(undefined),
  };
  const registry = {
    getProvider: (type: string) =>
      definitions[type]
        ? { definition: definitions[type], ...providerMethods }
        : undefined,
    getAvailableIntegrations: () =>
      Object.values(definitions).filter((d) => !d.hidden),
  };
  const encryption = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
  };
  const urlGuard = { validate: jest.fn().mockResolvedValue({}) };
  const auditService = { log: jest.fn() };
  const db = {
    transaction: () => ({
      execute: (callback: (trx: unknown) => unknown) => callback({}),
    }),
  };

  const service = new IntegrationConfigService(
    db as any,
    configRepo as any,
    integrationRepo as any,
    connectionRepo as any,
    registry as any,
    encryption as any,
    { getAppUrl: () => 'https://wiki.example' } as any,
    urlGuard as any,
    auditService as any,
  );
  return { service, configRepo, connectionRepo, encryption, urlGuard, auditService };
}

const stored = {
  type: 'gitea',
  baseUrl: 'https://git.example',
  clientId: 'id',
  clientSecret: 'enc:old',
};

describe('IntegrationConfigService.save', () => {
  it('encrypts the secret and never returns it', async () => {
    const { service, configRepo } = build();

    const view = await service.save(
      { type: 'gitea', baseUrl: 'https://git.example/', clientId: ' id ', clientSecret: 's3cret' },
      workspaceId,
      userId,
    );

    expect(configRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://git.example',
        clientId: 'id',
        clientSecret: 'enc:s3cret',
      }),
      expect.anything(),
    );
    expect(view).toEqual({
      type: 'gitea',
      baseUrl: 'https://git.example',
      clientId: 'id',
      hasClientSecret: true,
      callbackUrl: 'https://wiki.example/api/integrations/oauth/gitea/callback',
    });
    expect(JSON.stringify(view)).not.toContain('s3cret');
  });

  it('keeps the stored secret when none is sent', async () => {
    const { service, configRepo, encryption } = build(stored);

    await service.save(
      { type: 'gitea', baseUrl: stored.baseUrl, clientId: 'id' },
      workspaceId,
      userId,
    );

    expect(encryption.encrypt).not.toHaveBeenCalled();
    expect(configRepo.upsert.mock.calls[0][0].clientSecret).toBe('enc:old');
  });

  it('requires a secret on first save', async () => {
    const { service } = build();
    await expect(
      service.save(
        { type: 'gitea', baseUrl: stored.baseUrl, clientId: 'id' },
        workspaceId,
        userId,
      ),
    ).rejects.toThrow('Client secret is required');
  });

  it('requires a base URL where the provider has no default', async () => {
    const { service } = build();
    await expect(
      service.save(
        { type: 'gitea', clientId: 'id', clientSecret: 's' },
        workspaceId,
        userId,
      ),
    ).rejects.toThrow('Base URL is required');
  });

  it('ignores a base URL for hosted providers', async () => {
    const { service, configRepo, urlGuard } = build();

    await service.save(
      { type: 'linear', baseUrl: 'https://evil.example', clientId: 'id', clientSecret: 's' },
      workspaceId,
      userId,
    );

    expect(configRepo.upsert.mock.calls[0][0].baseUrl).toBeNull();
    expect(urlGuard.validate).not.toHaveBeenCalled();
  });

  it('refuses an address the outbound guard blocks', async () => {
    const { service, urlGuard, configRepo } = build();
    urlGuard.validate.mockRejectedValue(new OutboundUrlError('private address'));

    await expect(
      service.save(
        { type: 'gitea', baseUrl: 'http://10.0.0.5', clientId: 'id', clientSecret: 's' },
        workspaceId,
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(configRepo.upsert).not.toHaveBeenCalled();
  });

  it('refuses hidden and unknown providers', async () => {
    const { service } = build();
    for (const type of ['legacy', 'nope']) {
      await expect(
        service.save({ type, clientId: 'id', clientSecret: 's' }, workspaceId, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it.each([
    ['base URL', { baseUrl: 'https://other.example', clientId: 'id', clientSecret: 'new' }],
    ['client ID', { baseUrl: stored.baseUrl, clientId: 'other' }],
  ])('drops connections when the %s changes', async (_label, change) => {
    const { service, connectionRepo } = build(stored);

    await service.save({ type: 'gitea', ...change }, workspaceId, userId);

    expect(connectionRepo.deleteByIntegration).toHaveBeenCalledWith(
      'i1',
      expect.anything(),
    );
  });

  it('keeps connections when only the secret changes', async () => {
    const { service, connectionRepo } = build(stored);

    await service.save(
      { type: 'gitea', baseUrl: stored.baseUrl, clientId: 'id', clientSecret: 'new' },
      workspaceId,
      userId,
    );

    expect(connectionRepo.deleteByIntegration).not.toHaveBeenCalled();
  });

  it('drops connections when a first save moves GitHub off github.com', async () => {
    const { service, connectionRepo } = build();

    await service.save(
      { type: 'github', baseUrl: 'https://github.acme.com', clientId: 'id', clientSecret: 's' },
      workspaceId,
      userId,
    );

    expect(connectionRepo.deleteByIntegration).toHaveBeenCalled();
  });

  it('audits without the secret', async () => {
    const { service, auditService } = build();

    await service.save(
      { type: 'gitea', baseUrl: stored.baseUrl, clientId: 'id', clientSecret: 's3cret' },
      workspaceId,
      userId,
    );

    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('s3cret');
  });
});

describe('IntegrationConfigService API tokens', () => {
  const verifyApiToken = jest.fn();

  beforeEach(() => {
    verifyApiToken.mockReset();
    definitions.penpot = {
      type: 'penpot',
      setup: { auth: 'apiToken', baseUrl: 'optional' },
    };
    providerMethods.verifyApiToken = verifyApiToken;
  });

  afterEach(() => {
    delete definitions.penpot;
    delete providerMethods.verifyApiToken;
  });

  it('stores the token encrypted, with no client ID', async () => {
    const { service, configRepo } = build();

    await service.save({ type: 'penpot', clientSecret: 'tok' }, workspaceId, userId);

    expect(verifyApiToken).toHaveBeenCalledWith('tok', {});
    expect(configRepo.upsert.mock.calls[0][0]).toMatchObject({
      clientId: null,
      clientSecret: 'enc:tok',
    });
  });

  it('refuses a token the server rejects', async () => {
    const { service, configRepo } = build();
    verifyApiToken.mockRejectedValue(new TokenInvalidError());

    await expect(
      service.save({ type: 'penpot', clientSecret: 'bad' }, workspaceId, userId),
    ).rejects.toThrow('The server rejected this token');
    expect(configRepo.upsert).not.toHaveBeenCalled();
  });
});

describe('IntegrationConfigService server changes', () => {
  it('will not send a stored secret to a new server', async () => {
    const { service, configRepo } = build(stored);

    await expect(
      service.save(
        { type: 'gitea', baseUrl: 'https://other.example', clientId: 'id' },
        workspaceId,
        userId,
      ),
    ).rejects.toThrow('Enter the secret again');
    expect(configRepo.upsert).not.toHaveBeenCalled();
  });
});

describe('IntegrationConfigService credentials', () => {
  it('decrypts stored credentials', async () => {
    const { service } = build(stored);
    await expect(service.getCredentials(workspaceId, 'gitea')).resolves.toEqual({
      clientId: 'id',
      clientSecret: 'old',
    });
  });

  it('reads the shared record for a credentialsKey', async () => {
    const { service, configRepo } = build(stored);
    await service.findCredentials(workspaceId, 'jira', {
      credentialsKey: 'atlassian',
    });
    expect(configRepo.findByWorkspaceAndType).toHaveBeenCalledWith(
      workspaceId,
      'atlassian',
    );
  });

  it('refuses when nothing is configured', async () => {
    const { service } = build();
    await expect(
      service.getCredentials(workspaceId, 'gitea'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.findCredentials(workspaceId, 'gitea')).resolves.toBeNull();
  });
});

describe('IntegrationConfigService.list', () => {
  it('lists every available provider without any secret', async () => {
    const { service } = build(stored);

    const views = await service.list(workspaceId);

    expect(views.map((v) => v.type)).toEqual(['gitea', 'github', 'linear']);
    expect(views[0].hasClientSecret).toBe(true);
    expect(views[1]).toMatchObject({ clientId: null, hasClientSecret: false });
    expect(JSON.stringify(views)).not.toContain('old');
  });
});
