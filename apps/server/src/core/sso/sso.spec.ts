import { BadRequestException, ForbiddenException } from '@nestjs/common';

// openid-client is ESM-only; the logout service only needs the class token
jest.mock('./oidc.service', () => ({ OidcService: class {} }));
import { SsoLoginService } from './sso-login.service';
import { GOOGLE_ISSUER, SsoProviderService } from './sso-provider.service';
import {
  openSsoState,
  safeRedirectPath,
  sealSsoState,
  trustedReturnOrigin,
} from './sso-state';

const workspace = {
  id: 'ws_1',
  hostname: null,
  emailDomains: [],
  enforceSso: false,
  isScimEnabled: false,
} as any;
const provider = {
  id: 'prov_1',
  type: 'oidc',
  allowSignup: false,
  groupSync: false,
};
const identity = {
  providerUserId: 'sub-1',
  email: 'Ann@Example.com',
  name: 'Ann',
};

function loginService(opts: { existing?: any; account?: any } = {}) {
  const deps = {
    userRepo: {
      findById: jest
        .fn()
        .mockResolvedValue(opts.account ? { id: 'u_linked' } : undefined),
      findByEmail: jest.fn().mockResolvedValue(opts.existing),
      updateUser: jest.fn().mockResolvedValue(undefined),
    },
    groupRepo: {
      findByName: jest.fn(async (name: string) =>
        name === 'Engineering' ? { id: 'g_eng' } : undefined,
      ),
    },
    groupUserRepo: {
      getUserGroupIds: jest.fn().mockResolvedValue([]),
      addUserToGroup: jest.fn().mockResolvedValue(undefined),
    },
    authProviderRepo: {
      findAccount: jest.fn().mockResolvedValue(opts.account),
      linkAccount: jest.fn().mockResolvedValue(undefined),
    },
    signupService: { signup: jest.fn().mockResolvedValue({ id: 'u_new' }) },
    authService: { completeLogin: jest.fn().mockResolvedValue('token') },
  };
  const service = new SsoLoginService(
    deps.userRepo as any,
    deps.groupRepo as any,
    deps.groupUserRepo as any,
    deps.authProviderRepo as any,
    deps.signupService as any,
    deps.authService as any,
    { encrypt: (v: string) => `enc:${v}` } as any,
  );
  return { service, deps };
}

describe('SsoLoginService', () => {
  it('logs in an existing user by email and links the account', async () => {
    const { service, deps } = loginService({ existing: { id: 'u_1' } });

    const result = await service.login(provider, workspace, identity);

    expect(deps.userRepo.findByEmail).toHaveBeenCalledWith(
      'ann@example.com',
      'ws_1',
    );
    expect(deps.authProviderRepo.linkAccount).toHaveBeenCalledWith({
      providerId: 'prov_1',
      providerUserId: 'sub-1',
      userId: 'u_1',
      workspaceId: 'ws_1',
    });
    expect(deps.authService.completeLogin).toHaveBeenCalledWith(
      { id: 'u_1' },
      'ws_1',
      'sso:oidc',
      undefined,
    );
    expect(result.authToken).toBe('token');
  });

  it('keeps the encrypted id token on the session for IdP logout', async () => {
    const { service, deps } = loginService({ existing: { id: 'u_1' } });

    await service.login(provider, workspace, { ...identity, idToken: 'idt' });

    expect(deps.authService.completeLogin.mock.calls[0][3]).toEqual({
      sso: { providerId: 'prov_1', idToken: 'enc:idt' },
    });
  });

  it('prefers the linked account over the email', async () => {
    const { service, deps } = loginService({ account: { userId: 'u_linked' } });

    await service.login(provider, workspace, identity);

    expect(deps.userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('refuses unknown users unless sign-up is allowed', async () => {
    const { service, deps } = loginService();

    await expect(service.login(provider, workspace, identity)).rejects.toThrow(
      ForbiddenException,
    );
    expect(deps.signupService.signup).not.toHaveBeenCalled();
  });

  it('creates new users when sign-up is allowed', async () => {
    const { service, deps } = loginService();

    await service.login(
      { ...provider, allowSignup: true },
      workspace,
      identity,
    );

    const [dto, wsId] = deps.signupService.signup.mock.calls[0];
    expect(dto).toMatchObject({ name: 'Ann', email: 'ann@example.com' });
    expect(dto.password.length).toBeGreaterThanOrEqual(32);
    expect(wsId).toBe('ws_1');
    expect(deps.userRepo.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ hasGeneratedPassword: true }),
      'u_new',
      'ws_1',
    );
  });

  it('applies the allowed email domains to new users', async () => {
    const { service, deps } = loginService();

    await expect(
      service.login(
        { ...provider, allowSignup: true },
        { ...workspace, emailDomains: ['acme.com'] },
        identity,
      ),
    ).rejects.toThrow('not approved');
    expect(deps.signupService.signup).not.toHaveBeenCalled();
  });

  it('rejects unverified emails and missing emails', async () => {
    const { service } = loginService({ existing: { id: 'u_1' } });

    await expect(
      service.login(provider, workspace, { ...identity, emailVerified: false }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.login(provider, workspace, { ...identity, email: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects deactivated users', async () => {
    const { service, deps } = loginService({
      existing: { id: 'u_1', deactivatedAt: new Date() },
    });

    await expect(service.login(provider, workspace, identity)).rejects.toThrow(
      'deactivated',
    );
    expect(deps.authService.completeLogin).not.toHaveBeenCalled();
  });

  it('adds the user to matching groups when group sync is on', async () => {
    const { service, deps } = loginService({ existing: { id: 'u_1' } });

    await service.login({ ...provider, groupSync: true }, workspace, {
      ...identity,
      groups: ['Engineering', 'Unknown'],
    });

    expect(deps.groupUserRepo.addUserToGroup).toHaveBeenCalledTimes(1);
    expect(deps.groupUserRepo.addUserToGroup).toHaveBeenCalledWith(
      'u_1',
      'g_eng',
      'ws_1',
    );
  });

  it('leaves groups to SCIM when SCIM is enabled', async () => {
    const { service, deps } = loginService({ existing: { id: 'u_1' } });

    await service.login(
      { ...provider, groupSync: true },
      { ...workspace, isScimEnabled: true },
      { ...identity, groups: ['Engineering'] },
    );

    expect(deps.groupUserRepo.addUserToGroup).not.toHaveBeenCalled();
  });
});

function providerService(stored: any[] = []) {
  let rows = stored;
  const repo = {
    list: jest.fn(async () => rows),
    findById: jest.fn(async (id: string) => rows.find((r) => r.id === id)),
    insert: jest.fn(async (row) => ({ id: 'new', ...row })),
    update: jest.fn(),
    softDelete: jest.fn(async (id: string) => {
      rows = rows.filter((r) => r.id !== id);
    }),
  };
  const encryption = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
    decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
  };
  const domain = { getUrl: jest.fn(() => 'https://docs.acme.com') };
  const service = new SsoProviderService(
    repo as any,
    encryption as any,
    domain as any,
  );
  return { service, repo };
}

describe('SsoProviderService', () => {
  it('encrypts the client secret and never returns it', async () => {
    const { service, repo } = providerService();

    const created = await service.create(
      {
        type: 'oidc',
        name: 'Keycloak',
        oidcIssuer: 'https://idp.acme.com/realms/acme',
        oidcClientId: 'docmost',
        oidcClientSecret: 's3cret',
      },
      'admin_1',
      workspace,
    );

    expect(repo.insert.mock.calls[0][0].oidcClientSecret).toBe('enc:s3cret');
    expect(JSON.stringify(created)).not.toContain('s3cret');
    expect(created.hasOidcClientSecret).toBe(true);
    expect(created.callbackUrl).toBe(
      'https://docs.acme.com/api/auth-sso/new/callback',
    );
  });

  it('fixes the Google issuer', async () => {
    const { service, repo } = providerService();

    await service.create(
      {
        type: 'google',
        name: 'Google',
        oidcClientId: 'id',
        oidcClientSecret: 'x',
      },
      'admin_1',
      workspace,
    );

    expect(repo.insert.mock.calls[0][0].oidcIssuer).toBe(GOOGLE_ISSUER);
  });

  it('rejects incomplete providers', async () => {
    const { service } = providerService();

    await expect(
      service.create(
        { type: 'oidc', name: 'x', oidcClientId: 'id' },
        'a',
        workspace,
      ),
    ).rejects.toThrow('Missing required fields');
  });

  it('keeps the stored secret when an update leaves it empty', async () => {
    const { service, repo } = providerService([
      {
        id: 'p1',
        type: 'oidc',
        isEnabled: true,
        oidcIssuer: 'https://idp',
        oidcClientId: 'id',
        oidcClientSecret: 'enc:old',
      },
    ]);

    await service.update(
      { providerId: 'p1', name: 'Renamed', oidcClientSecret: '' },
      workspace,
    );

    expect(repo.update.mock.calls[0][2]).not.toHaveProperty('oidcClientSecret');
  });

  it('will not disable the last provider while SSO is enforced', async () => {
    const { service, repo } = providerService([
      {
        id: 'p1',
        type: 'oidc',
        isEnabled: true,
        oidcIssuer: 'https://idp',
        oidcClientId: 'id',
        oidcClientSecret: 'enc:x',
      },
    ]);

    await expect(
      service.remove('p1', { ...workspace, enforceSso: true }),
    ).rejects.toThrow('Turn off SSO enforcement');
    await expect(
      service.update(
        { providerId: 'p1', isEnabled: false },
        { ...workspace, enforceSso: true },
      ),
    ).rejects.toThrow('Turn off SSO enforcement');
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});

describe('sso state', () => {
  const encryption = {
    encrypt: (v: string) => Buffer.from(v).toString('base64'),
    decrypt: (v: string) => Buffer.from(v, 'base64').toString(),
  } as any;

  it('round-trips for the same provider only', () => {
    const sealed = sealSsoState(encryption, {
      providerId: 'p1',
      redirect: '/home',
      state: 's',
    });

    expect(openSsoState(encryption, sealed, 'p1')?.state).toBe('s');
    expect(openSsoState(encryption, sealed, 'p2')).toBeNull();
    expect(openSsoState(encryption, 'garbage', 'p1')).toBeNull();
  });

  it('only allows same-origin redirect paths', () => {
    expect(safeRedirectPath('/s/general/p/abc')).toBe('/s/general/p/abc');
    expect(safeRedirectPath('https://evil.com')).toBe('/home');
    expect(safeRedirectPath('//evil.com')).toBe('/home');
    expect(safeRedirectPath('/\\evil.com')).toBe('/home');
    expect(safeRedirectPath(undefined)).toBe('/home');
  });
});

describe('trustedReturnOrigin', () => {
  const app = 'https://docs.acme.com';

  it('accepts the app origin', () => {
    expect(trustedReturnOrigin('https://docs.acme.com', app, false)).toBe(app);
  });

  it('accepts localhost ports only in development', () => {
    expect(
      trustedReturnOrigin(
        'http://localhost:5173',
        'http://localhost:3000',
        true,
      ),
    ).toBe('http://localhost:5173');
    expect(
      trustedReturnOrigin(
        'http://localhost:5173',
        'http://localhost:3000',
        false,
      ),
    ).toBeUndefined();
  });

  it('rejects other hosts', () => {
    expect(trustedReturnOrigin('https://evil.com', app, true)).toBeUndefined();
    expect(trustedReturnOrigin('http://undefined', app, true)).toBeUndefined();
    expect(trustedReturnOrigin('garbage', app, true)).toBeUndefined();
  });
});

describe('SsoLogoutService', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SsoLogoutService } = require('./sso-logout.service');
  const ws = { ...workspace, hostname: null };

  function logoutService(stored: any) {
    const oidc = {
      buildLogoutUrl: jest.fn().mockResolvedValue('https://idp/logout?x'),
    };
    const service = new SsoLogoutService(
      { findById: jest.fn().mockResolvedValue(stored) } as any,
      {
        appUrl: () => 'https://docs.acme.com',
        getForLogin: jest.fn().mockResolvedValue({ id: 'p1' }),
      } as any,
      oidc as any,
      { decrypt: (v: string) => v.replace(/^enc:/, '') } as any,
      { isDevelopment: () => false } as any,
    );
    return { service, oidc };
  }
  const meta = { sso: { providerId: 'p1', idToken: 'enc:idt' } };

  it('builds the IdP logout URL back to the login page', async () => {
    const { service, oidc } = logoutService({
      id: 'p1',
      type: 'oidc',
      isEnabled: true,
    });

    await expect(
      service.getLogoutUrl(meta, ws, 'https://docs.acme.com'),
    ).resolves.toBe('https://idp/logout?x');
    expect(oidc.buildLogoutUrl).toHaveBeenCalledWith(
      { id: 'p1' },
      'idt',
      'https://docs.acme.com/login?logout=1',
    );
  });

  it('skips sessions without SSO, disabled providers and unknown origins', async () => {
    const enabled = logoutService({ id: 'p1', type: 'oidc', isEnabled: true });
    await expect(
      enabled.service.getLogoutUrl(null, ws, 'https://docs.acme.com'),
    ).resolves.toBeNull();
    await expect(
      enabled.service.getLogoutUrl(meta, ws, 'https://evil.com'),
    ).resolves.toBeNull();

    const disabled = logoutService({
      id: 'p1',
      type: 'oidc',
      isEnabled: false,
    });
    await expect(
      disabled.service.getLogoutUrl(meta, ws, 'https://docs.acme.com'),
    ).resolves.toBeNull();
    expect(disabled.oidc.buildLogoutUrl).not.toHaveBeenCalled();
  });
});
