import { PenpotProvider } from './penpot.provider';
import { PenpotService } from './penpot.service';

const fetchMock = jest.fn();

jest.mock('../../../../common/proxy-fetch', () => ({
  proxyFetch: (...args: unknown[]) => fetchMock(...args),
}));

const FILE = '6f1c2a3b-1111-4222-8333-444455556666';
const PROJECT = '0a1b2c3d-1111-4222-8333-444455556666';
const SAAS = 'https://design.penpot.app';
const provider = new PenpotProvider(new PenpotService());

function find(url: string, settings: Record<string, any> = {}) {
  for (const pattern of provider.getUnfurlPatterns(settings)) {
    const match = url.match(pattern.regex);
    if (match) return match;
  }
  return null;
}

describe('Penpot links', () => {
  it.each([
    `${SAAS}/#/workspace?team-id=${PROJECT}&file-id=${FILE}&page-id=${PROJECT}`,
    `${SAAS}/#/workspace/${PROJECT}/${FILE}?page-id=${PROJECT}`,
    `${SAAS}/#/view?file-id=${FILE}&page-id=${PROJECT}&section=interactions`,
    `${SAAS}/#/view/${FILE}?page-id=${PROJECT}`,
  ])('reads the file id from %s', (url) => {
    expect(find(url)?.[1]).toBe(FILE);
  });

  it('only matches the configured server', () => {
    const settings = { baseUrl: 'https://penpot.acme.com' };
    expect(find(`${SAAS}/#/view/${FILE}`, settings)).toBeNull();
    expect(find(`https://penpot.acme.com/#/view/${FILE}`, settings)?.[1]).toBe(
      FILE,
    );
    expect(provider.getUnfurlHosts(settings)).toEqual(['penpot.acme.com']);
  });

  it('ignores pages that are not a file', () => {
    expect(find(`${SAAS}/#/dashboard/recent`)).toBeNull();
  });
});

describe('PenpotProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ name: 'Landing page' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
  });

  it('reads the file name over RPC with the Token scheme', async () => {
    const url = `${SAAS}/#/view/${FILE}`;

    await expect(
      provider.unfurl({
        url,
        accessToken: 'tok',
        match: find(url)!,
        patternType: 'penpot-file',
        settings: {},
        userId: 'u1',
        integrationId: 'i1',
      }),
    ).resolves.toMatchObject({ title: 'Landing page', provider: 'penpot' });

    const [requested, init] = fetchMock.mock.calls[0];
    expect(requested).toBe(`${SAAS}/api/rpc/command/get-file-summary`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Token tok');
    expect(JSON.parse(init.body)).toEqual({ id: FILE });
  });

  it('verifies a token against the configured server', async () => {
    await provider.verifyApiToken('tok', { baseUrl: 'https://penpot.acme.com' });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://penpot.acme.com/api/rpc/command/get-profile',
    );
  });
});
