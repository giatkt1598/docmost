import { JiraProvider } from './jira.provider';
import { JiraService } from './jira.service';
import { UnfurlForbiddenError } from '../../registry/integration-provider.interface';

const fetchMock = jest.fn();

jest.mock('../../../../common/proxy-fetch', () => ({
  proxyFetch: (...args: unknown[]) => fetchMock(...args),
}));

const CLOUD_URL = 'https://acme.atlassian.net/browse/DOC-7';
const SERVER = 'https://jira.acme.com';
const provider = new JiraProvider(new JiraService());

const ISSUE = {
  key: 'DOC-7',
  fields: {
    summary: 'Fix login',
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    assignee: { displayName: 'Ada', avatarUrls: { '48x48': 'https://a/48.png' } },
    issuetype: { name: 'Bug', iconUrl: 'https://a/bug.png' },
    updated: '2026-10-01T00:00:00.000+0000',
  },
};

function reply(...bodies: unknown[]) {
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
}

function find(url: string, settings: Record<string, any> = {}) {
  for (const pattern of provider.getUnfurlPatterns(settings)) {
    const match = url.match(pattern.regex);
    if (match) return match;
  }
  return null;
}

function unfurl(url: string, settings: Record<string, any> = {}) {
  return provider.unfurl({
    url,
    settings,
    match: find(url, settings)!,
    patternType: 'jira-issue',
    accessToken: 'token',
    userId: 'u1',
    integrationId: 'i1',
  });
}

describe('Jira links', () => {
  it.each([
    CLOUD_URL,
    'https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=1&selectedIssue=DOC-7',
    'https://acme.atlassian.net/jira/software/c/projects/DOC/boards/1?selectedIssue=DOC-7',
  ])('reads the key from %s on Jira Cloud', (url) => {
    expect(find(url)?.[1]).toBe('DOC-7');
  });

  it('keeps Cloud and Data Center apart', () => {
    const settings = { baseUrl: SERVER };
    expect(find(`${SERVER}/browse/DOC-7`)).toBeNull();
    expect(find(CLOUD_URL, settings)).toBeNull();
    expect(find(`${SERVER}/browse/DOC-7`, settings)?.[1]).toBe('DOC-7');
  });

  it('supports a Data Center context path', () => {
    const settings = { baseUrl: `${SERVER}/jira` };
    expect(find(`${SERVER}/jira/browse/DOC-7`, settings)?.[1]).toBe('DOC-7');
  });

  it('reports the hosts it serves', () => {
    expect(provider.getUnfurlHosts({})).toEqual(['*.atlassian.net']);
    expect(provider.getUnfurlHosts({ baseUrl: SERVER })).toEqual(['jira.acme.com']);
  });
});

describe('JiraProvider OAuth', () => {
  it('uses the Atlassian authorization server for Cloud', () => {
    expect(provider.getOAuthConfig({})).toMatchObject({
      authUrl: 'https://auth.atlassian.com/authorize',
      authParams: { audience: 'api.atlassian.com', prompt: 'consent' },
      tokenRequestFormat: 'json',
    });
    expect(provider.getOAuthConfig({}).scopes).toContain('offline_access');
  });

  it('uses the instance for Data Center', () => {
    expect(provider.getOAuthConfig({ baseUrl: SERVER })).toMatchObject({
      authUrl: `${SERVER}/rest/oauth2/latest/authorize`,
      tokenUrl: `${SERVER}/rest/oauth2/latest/token`,
      scopes: ['READ'],
      redirectUriOnRefresh: true,
    });
  });
});

describe('JiraProvider unfurl', () => {
  beforeEach(() => fetchMock.mockReset());

  it('reaches a Cloud site through its cloud id', async () => {
    reply(
      [
        { id: 'other', url: 'https://other.atlassian.net' },
        { id: 'cloud-1', url: 'https://acme.atlassian.net' },
      ],
      ISSUE,
    );

    await expect(unfurl(CLOUD_URL)).resolves.toMatchObject({
      title: 'Fix login',
      provider: 'jira',
      status: 'In Progress',
      statusColor: 'blue',
      author: 'Ada',
      metadata: { issueKey: 'DOC-7', issueTypeIconUrl: 'https://a/bug.png' },
    });

    const requested = fetchMock.mock.calls[1][0];
    expect(requested).toContain(
      'https://api.atlassian.com/ex/jira/cloud-1/rest/api/2/issue/DOC-7?',
    );
  });

  it('shows no card for a site the member cannot reach', async () => {
    reply([{ id: 'other', url: 'https://other.atlassian.net' }]);

    await expect(unfurl(CLOUD_URL)).rejects.toBeInstanceOf(UnfurlForbiddenError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls a Data Center instance directly', async () => {
    reply(ISSUE);

    await unfurl(`${SERVER}/browse/DOC-7`, { baseUrl: SERVER });

    const [requested, init] = fetchMock.mock.calls[0];
    expect(requested).toContain(`${SERVER}/rest/api/2/issue/DOC-7?`);
    expect(init.headers.Authorization).toBe('Bearer token');
  });

  it('reads the connected account per deployment', async () => {
    reply({ account_id: 'abc', name: 'Ada', nickname: 'ada' });
    await expect(
      provider.resolveAccount({ accessToken: 't', tokenResponse: {} }),
    ).resolves.toEqual({ id: 'abc', displayName: 'Ada', username: 'ada' });

    reply({ key: 'JIRAUSER1', name: 'ada', displayName: 'Ada' });
    await expect(
      provider.resolveAccount({
        accessToken: 't',
        tokenResponse: {},
        settings: { baseUrl: SERVER },
      }),
    ).resolves.toEqual({ id: 'JIRAUSER1', displayName: 'Ada', username: 'ada' });
    expect(fetchMock.mock.calls[1][0]).toBe(`${SERVER}/rest/api/2/myself`);
  });
});
