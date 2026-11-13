import { SprintBootProvider } from './sprint-boot.provider';
import { SprintBootService } from './sprint-boot.service';
import { extractSprintBootUrls } from './sprint-boot-links';

const fetchMock = jest.fn();

jest.mock('../../../../common/proxy-fetch', () => ({
  proxyFetch: (...args: unknown[]) => fetchMock(...args),
}));

const BASE = 'https://sprint.acme.com';
const provider = new SprintBootProvider(new SprintBootService());
const settings = { baseUrl: BASE };

function find(url: string) {
  for (const pattern of provider.getUnfurlPatterns(settings)) {
    const match = url.match(pattern.regex);
    if (match) return match;
  }
  return null;
}

describe('Sprint Boot links', () => {
  it('reads the ticket key from a browse address on the configured server', () => {
    expect(find(`${BASE}/browse/SB-12`)?.[1]).toBe('SB-12');
    expect(find(`${BASE}/browse/SB-12?focus=comments`)?.[1]).toBe('SB-12');
    expect(provider.getUnfurlHosts(settings)).toEqual(['sprint.acme.com']);
  });

  it('leaves other servers and other pages alone', () => {
    expect(find('https://acme.atlassian.net/browse/SB-12')).toBeNull();
    expect(find(`${BASE}/spaces/SB/board`)).toBeNull();
    expect(find(`${BASE}/browse/SB-12x`)).toBeNull();
  });

  it('reads a pasted bridge address as the server it sits on', () => {
    const pasted = { baseUrl: `${BASE}/api/v1/docs-bridge` };
    expect(provider.getUnfurlHosts(pasted)).toEqual(['sprint.acme.com']);
    expect(provider.getUnfurlPatterns(pasted)[0].regex.test(`${BASE}/browse/SB-1`)).toBe(true);
  });

  it('offers nothing until a server is configured', () => {
    expect(provider.getUnfurlPatterns({})).toEqual([]);
    expect(provider.getUnfurlHosts({})).toEqual([]);
  });
});

describe('extractSprintBootUrls', () => {
  it('finds smart links and plain links to the server, once each', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'integrationMention', attrs: { url: `${BASE}/browse/SB-1`, provider: 'sprint-boot' } },
        { type: 'integrationCard', attrs: { url: `${BASE}/browse/SB-1`, provider: 'sprint-boot' } },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'see', marks: [{ type: 'link', attrs: { href: `${BASE}/browse/SB-2` } }] },
            { type: 'text', text: 'jira', marks: [{ type: 'link', attrs: { href: 'https://acme.atlassian.net/browse/SB-3' } }] },
            { type: 'text', text: 'board', marks: [{ type: 'link', attrs: { href: `${BASE}/spaces/SB/board` } }] },
          ],
        },
      ],
    };

    expect(extractSprintBootUrls(doc, BASE)).toEqual([`${BASE}/browse/SB-1`, `${BASE}/browse/SB-2`]);
  });
});

describe('SprintBootProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            tickets: [
              {
                key: 'SB-12',
                title: 'Login page',
                url: `${BASE}/browse/SB-12`,
                status: 'In Progress',
                statusCategory: 'inProgress',
                type: 'Task',
                typeIcon: 'task',
                priority: 'High',
                assignee: 'Dev',
                spaceKey: 'SB',
                archived: false,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
  });

  it('unfurls a ticket through the bridge with the bearer secret', async () => {
    const url = `${BASE}/browse/SB-12`;
    const result = await provider.unfurl({
      url,
      accessToken: 'sbd_secret',
      match: find(url)!,
      patternType: 'sprint-boot-ticket',
      settings,
      userId: 'u1',
      integrationId: 'i1',
    });

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`${BASE}/api/v1/docs-bridge/unfurl`);
    expect(init.headers.Authorization).toBe('Bearer sbd_secret');
    expect(JSON.parse(init.body)).toEqual({ keys: ['SB-12'] });
    expect(result).toMatchObject({
      title: 'SB-12 Login page',
      status: 'In Progress',
      statusColor: 'blue',
      author: 'Dev',
      provider: 'sprint-boot',
    });
  });

  it('refuses a secret Sprint Boot does not accept', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(provider.verifyApiToken('wrong', settings)).rejects.toThrow();
  });
});
