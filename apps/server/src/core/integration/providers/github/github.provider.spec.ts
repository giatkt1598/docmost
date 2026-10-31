import { GitHubProvider } from './github.provider';
import { IntegrationRegistry } from '../../registry/integration-registry';
import { UnfurlPattern } from '../../registry/integration-provider.interface';

const GHE_BASE = 'https://github.acme.com';
const PUBLIC_PR = 'https://github.com/o/r/pull/1';
const GHE_PR = `${GHE_BASE}/o/r/pull/1`;
const GHE_SETTINGS = { baseUrl: GHE_BASE };

function buildProvider() {
  const unfurlPullRequest = jest.fn().mockResolvedValue({});
  const provider = new GitHubProvider({ unfurlPullRequest } as any);
  return { provider, unfurlPullRequest };
}

function firstMatch(patterns: UnfurlPattern[], url: string) {
  for (const pattern of patterns) {
    const match = url.match(pattern.regex);
    if (match) return { match, patternType: pattern.type };
  }
  return null;
}

function matches(
  provider: GitHubProvider,
  url: string,
  settings: Record<string, any> = {},
): boolean {
  return firstMatch(provider.getUnfurlPatterns(settings), url) !== null;
}

async function unfurlWith(
  provider: GitHubProvider,
  url: string,
  settings: Record<string, any> = {},
) {
  const found = firstMatch(provider.getUnfurlPatterns(settings), url)!;
  await provider.unfurl({ ...found, url, accessToken: 'token', settings } as any);
}

describe('GitHubProvider host matching', () => {
  it('declares no static unfurl patterns', () => {
    const { provider } = buildProvider();
    expect(provider.definition.unfurlPatterns).toBeUndefined();

    const registry = new IntegrationRegistry();
    registry.register(provider);
    expect(registry.findUnfurlProvider(PUBLIC_PR)).toBeNull();
  });

  describe('github.com (no base URL)', () => {
    it('matches github.com links', () => {
      const { provider } = buildProvider();
      expect(matches(provider, PUBLIC_PR)).toBe(true);
      expect(matches(provider, 'https://github.com/o/r')).toBe(true);
      expect(matches(provider, GHE_PR)).toBe(false);
    });

    it('calls api.github.com', async () => {
      const { provider, unfurlPullRequest } = buildProvider();
      await unfurlWith(provider, PUBLIC_PR);
      expect(unfurlPullRequest).toHaveBeenCalledWith(
        'Bearer token', 'https://api.github.com', 'o', 'r', 1, PUBLIC_PR,
      );
    });
  });

  describe('GitHub Enterprise (base URL set)', () => {
    it('does not match github.com links', () => {
      const { provider } = buildProvider();
      expect(matches(provider, PUBLIC_PR, GHE_SETTINGS)).toBe(false);
      expect(matches(provider, 'https://github.com/o/r', GHE_SETTINGS)).toBe(
        false,
      );
    });

    it('matches links on the configured host', () => {
      const { provider } = buildProvider();
      expect(matches(provider, GHE_PR, GHE_SETTINGS)).toBe(true);
      expect(matches(provider, `${GHE_BASE}/o/r`, GHE_SETTINGS)).toBe(true);
    });

    it('sends the token to the configured instance api', async () => {
      const { provider, unfurlPullRequest } = buildProvider();
      await unfurlWith(provider, GHE_PR, GHE_SETTINGS);
      expect(unfurlPullRequest).toHaveBeenCalledWith(
        'Bearer token', `${GHE_BASE}/api/v3`, 'o', 'r', 1, GHE_PR,
      );
    });

    it('points OAuth at the configured instance', () => {
      const { provider } = buildProvider();
      expect(provider.getOAuthConfig(GHE_SETTINGS)).toMatchObject({
        authUrl: `${GHE_BASE}/login/oauth/authorize`,
        tokenUrl: `${GHE_BASE}/login/oauth/access_token`,
      });
    });

    it.each(['https://GitHub.Acme.com', 'https://github.acme.com/', 'HTTPS://GITHUB.ACME.COM//'])(
      'normalizes %s to match lowercase pasted links',
      async (baseUrl) => {
        const { provider, unfurlPullRequest } = buildProvider();
        expect(matches(provider, GHE_PR, { baseUrl })).toBe(true);
        await unfurlWith(provider, GHE_PR, { baseUrl });
        expect(unfurlPullRequest.mock.calls[0][1]).toBe(`${GHE_BASE}/api/v3`);
      },
    );
  });

  describe('invalid base URL', () => {
    it.each(['github.acme.com', 'github.acme.com:8443', 'ftp://github.acme.com'])(
      'falls back to github.com for %s',
      async (baseUrl) => {
        const { provider, unfurlPullRequest } = buildProvider();

        expect(matches(provider, PUBLIC_PR, { baseUrl })).toBe(true);
        expect(matches(provider, GHE_PR, { baseUrl })).toBe(false);
        expect(provider.getOAuthConfig({ baseUrl })).toMatchObject({
          authUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
        });
        await unfurlWith(provider, PUBLIC_PR, { baseUrl });
        expect(unfurlPullRequest.mock.calls[0][1]).toBe('https://api.github.com');
      },
    );
  });

  describe('getUnfurlHosts', () => {
    it('reports github.com without a base URL', () => {
      const { provider } = buildProvider();
      expect(provider.getUnfurlHosts({})).toEqual(['github.com']);
    });

    it('reports the configured host', () => {
      const { provider } = buildProvider();
      expect(provider.getUnfurlHosts(GHE_SETTINGS)).toEqual(['github.acme.com']);
    });

    it.each(['https://GitHub.Acme.com', 'https://github.acme.com/'])(
      'reports %s as a lowercase hostname',
      (baseUrl) => {
        const { provider } = buildProvider();
        expect(provider.getUnfurlHosts({ baseUrl })).toEqual(['github.acme.com']);
      },
    );
  });
});
