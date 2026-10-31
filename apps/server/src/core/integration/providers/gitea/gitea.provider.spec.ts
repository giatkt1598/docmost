import { GiteaProvider } from './gitea.provider';
import { GiteaService } from './gitea.service';
import { UnfurlForbiddenError } from '../../registry/integration-provider.interface';

const fetchMock = jest.fn();

jest.mock('../../../../common/proxy-fetch', () => ({
  proxyFetch: (...args: unknown[]) => fetchMock(...args),
}));

const BASE = 'https://git.example';
const settings = { baseUrl: BASE };
const provider = new GiteaProvider(new GiteaService());

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function find(url: string, config: Record<string, any> = settings) {
  for (const pattern of provider.getUnfurlPatterns(config)) {
    const match = url.match(pattern.regex);
    if (match) return { match, patternType: pattern.type };
  }
  return null;
}

function unfurl(url: string, accessToken = 'token') {
  return provider.unfurl({
    ...find(url)!,
    url,
    accessToken,
    settings,
    userId: 'u1',
    integrationId: 'i1',
  });
}

describe('Gitea link patterns', () => {
  it.each([
    [`${BASE}/o/r`, 'gitea-repo'],
    [`${BASE}/o/r/`, 'gitea-repo'],
    [`${BASE}/o/r/pulls/12`, 'gitea-pr'],
    [`${BASE}/o/r/pulls/12/files`, 'gitea-pr'],
    [`${BASE}/o/r/pulls/12/commits/abc1234`, 'gitea-pr-commit'],
    [`${BASE}/o/r/pulls`, 'gitea-pulls-list'],
    [`${BASE}/o/r/pulls?state=closed`, 'gitea-pulls-list'],
    [`${BASE}/o/r/issues/3`, 'gitea-issue'],
    [`${BASE}/o/r/issues`, 'gitea-issues-list'],
    [`${BASE}/o/r/commit/abc1234`, 'gitea-commit'],
    [`${BASE}/o/r/src/branch/main/src/a.ts#L2-L4`, 'gitea-file'],
    [`${BASE}/o/r/src/tag/v1/a.ts`, 'gitea-file'],
    [`${BASE}/o/r/releases`, 'gitea-releases-list'],
  ])('classifies %s as %s', (url, type) => {
    expect(find(url)?.patternType).toBe(type);
  });

  it('ignores other hosts and GitHub-style PR links', () => {
    expect(find('https://github.com/o/r/pulls/1')).toBeNull();
    expect(find(`${BASE}/o/r/pull/1`)).toBeNull();
  });

  it('refuses a link that climbs out of the base path', () => {
    expect(find(`${BASE}/git/../o/r`, { baseUrl: `${BASE}/git` })).toBeNull();
  });

  it('supports a server under a sub-path', () => {
    expect(find(`${BASE}/git/o/r/issues/3`, { baseUrl: `${BASE}/git` })?.patternType).toBe(
      'gitea-issue',
    );
  });

  it('has nothing to match before a base URL is saved', () => {
    expect(provider.getUnfurlPatterns({})).toEqual([]);
    expect(provider.getUnfurlHosts({})).toEqual([]);
  });

  it('reports the configured host', () => {
    expect(provider.getUnfurlHosts(settings)).toEqual(['git.example']);
  });
});

describe('GiteaProvider', () => {
  beforeEach(() => fetchMock.mockReset());

  it('points OAuth at the configured server', () => {
    expect(provider.getOAuthConfig(settings)).toMatchObject({
      authUrl: `${BASE}/login/oauth/authorize`,
      tokenUrl: `${BASE}/login/oauth/access_token`,
    });
  });

  it('reads the connected account', async () => {
    reply({ id: 7, login: 'ada', full_name: 'Ada Lovelace', email: 'a@b.c' });

    await expect(
      provider.resolveAccount({ accessToken: 't', tokenResponse: {}, settings }),
    ).resolves.toEqual({ id: '7', displayName: 'Ada Lovelace', username: 'ada' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/user`);
  });

  it('unfurls a merged pull request', async () => {
    reply({
      number: 12,
      title: 'Add dark mode',
      state: 'closed',
      merged: true,
      user: { login: 'ada' },
      updated_at: '2026-10-01T00:00:00Z',
    });

    await expect(unfurl(`${BASE}/o/r/pulls/12`)).resolves.toMatchObject({
      title: 'Add dark mode',
      provider: 'gitea',
      status: 'merged',
      statusColor: 'violet',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/repos/o/r/pulls/12`);
    expect(init.headers.Authorization).toBe('Bearer token');
  });

  it('reads a commit from /git/commits', async () => {
    reply({ sha: 'abc1234def', commit: { message: 'Fix bug\n\nbody' } });

    await expect(unfurl(`${BASE}/o/r/commit/abc1234`)).resolves.toMatchObject({
      title: 'Fix bug',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/api/v1/repos/o/r/git/commits/abc1234`,
    );
  });

  it('builds file cards without calling the server', async () => {
    await expect(
      unfurl(`${BASE}/o/r/src/branch/main/src/a.ts#L2-L4`),
    ).resolves.toMatchObject({ title: 'a.ts#L2-L4', description: 'o/r · main' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads public data anonymously', async () => {
    reply({ full_name: 'o/r', private: false });
    const url = `${BASE}/o/r`;

    await provider.unfurlPublic({ ...find(url)!, url, settings });

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('refuses dot segments before calling the server', async () => {
    expect(find(`${BASE}/o/../issues/1`)).toBeNull();
    const url = `${BASE}/o/r/issues/1`;

    await expect(
      provider.unfurlPublic({
        url,
        match: ['', '..', 'r', '1'] as unknown as RegExpMatchArray,
        patternType: 'gitea-issue',
        settings,
      }),
    ).rejects.toBeInstanceOf(UnfurlForbiddenError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
