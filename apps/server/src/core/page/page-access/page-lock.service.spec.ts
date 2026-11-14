import { ForbiddenException } from '@nestjs/common';
import { PageLockService } from './page-lock.service';
import {
  PAGE_PASSWORD_REQUIRED,
  PAGE_UNLOCK_CLS_KEY,
  readUnlockCookies,
} from './page-lock.constants';

const PAGE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const OTHER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

const CHILD = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';

const source = (pageId: string, version: number, inherited = false) => ({
  pageId,
  version,
  includeSubPages: true,
  inherited,
  title: 'T',
  icon: null,
});

function makeService(opts: {
  versions?: Record<string, number>;
  // page id -> its lock sources, beyond its own password
  inherited?: Record<string, ReturnType<typeof source>[]>;
  cookies?: Record<string, string>;
}) {
  const repo = {
    getLockSources: jest.fn(async (ids: string[]) => {
      const map = new Map<string, ReturnType<typeof source>[]>();
      for (const id of ids) {
        const list = [
          ...(opts.versions?.[id] !== undefined
            ? [source(id, opts.versions[id])]
            : []),
          ...(opts.inherited?.[id] ?? []),
        ];
        if (list.length) map.set(id, list);
      }
      return map;
    }),
  };
  // tokens look like "<pageId>:<version>" in these tests
  const tokenService = {
    verifyJwt: jest.fn(async (token: string, type: string) => {
      const [pageId, pv] = token.split(':');
      if (type !== 'page_unlock' || !pv) throw new Error('bad token');
      return { pageId, pv: Number(pv), type };
    }),
  };
  const cls = {
    get: jest.fn((key: string) =>
      key === PAGE_UNLOCK_CLS_KEY ? opts.cookies : undefined,
    ),
  };
  return new PageLockService(repo as any, tokenService as any, cls as any);
}

describe('PageLockService', () => {
  it('leaves pages without a password open', async () => {
    const service = makeService({});
    await expect(service.isLocked(PAGE)).resolves.toBe(false);
    await expect(service.assertUnlocked({ id: PAGE })).resolves.toBeUndefined();
  });

  it('locks a protected page until the request carries a valid unlock', async () => {
    const locked = makeService({ versions: { [PAGE]: 2 } });
    await expect(locked.isLocked(PAGE)).resolves.toBe(true);

    const unlocked = makeService({
      versions: { [PAGE]: 2 },
      cookies: { [PAGE]: `${PAGE}:2` },
    });
    await expect(unlocked.isLocked(PAGE)).resolves.toBe(false);
  });

  it('refuses an unlock issued for an earlier password', async () => {
    const service = makeService({
      versions: { [PAGE]: 3 },
      cookies: { [PAGE]: `${PAGE}:2` },
    });
    await expect(service.isLocked(PAGE)).resolves.toBe(true);
  });

  it('refuses an unlock issued for another page', async () => {
    const service = makeService({
      versions: { [PAGE]: 1 },
      cookies: { [PAGE]: `${OTHER}:1` },
    });
    await expect(service.isLocked(PAGE)).resolves.toBe(true);
  });

  it('accepts an unlock passed in, as the collaboration socket does', async () => {
    const service = makeService({ versions: { [PAGE]: 1 } });
    await expect(
      service.isLocked(PAGE, { [PAGE]: `${PAGE}:1` }),
    ).resolves.toBe(false);
  });

  it('locks a sub-page under a password covering sub-pages, unlocked by that page', async () => {
    const inherited = { [CHILD]: [source(PAGE, 1, true)] };
    const locked = makeService({ inherited });
    const error = await locked
      .assertUnlocked({ id: CHILD, title: 'Child' })
      .catch((e) => e);
    // the password to enter is the parent's
    expect(error.getResponse()).toMatchObject({
      page: { id: PAGE },
      requestedPage: { id: CHILD },
    });

    const unlocked = makeService({
      inherited,
      cookies: { [PAGE]: `${PAGE}:1` },
    });
    await expect(unlocked.isLocked(CHILD)).resolves.toBe(false);
  });

  it('needs every password that protects a page', async () => {
    const service = makeService({
      versions: { [CHILD]: 1 },
      inherited: { [CHILD]: [source(PAGE, 1, true)] },
      cookies: { [PAGE]: `${PAGE}:1` },
    });
    await expect(service.isLocked(CHILD)).resolves.toBe(true);
  });

  it('asks for the password a move would enter or leave', async () => {
    const service = makeService({ versions: { [PAGE]: 1 } });
    await expect(
      service.assertSourcesUnlocked(await service.sourcesForChildOf(PAGE)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertSourcesUnlocked(await service.sourcesForChildOf(null)),
    ).resolves.toBeUndefined();
  });

  it('reports the code and the title, never the content', async () => {
    const service = makeService({ versions: { [PAGE]: 1 } });
    const error = await service
      .assertUnlocked({ id: PAGE, title: 'Salaries', icon: null })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({
      code: PAGE_PASSWORD_REQUIRED,
      page: { id: PAGE },
      requestedPage: { id: PAGE, title: 'Salaries' },
    });
  });

  it('lists only the protected pages left locked', async () => {
    const service = makeService({
      versions: { [PAGE]: 1, [OTHER]: 1 },
      cookies: { [OTHER]: `${OTHER}:1` },
    });
    const locked = await service.lockedPageIds([PAGE, OTHER, 'plain']);
    expect([...locked]).toEqual([PAGE]);
  });
});

describe('readUnlockCookies', () => {
  it('reads pu_<pageId> cookies and ignores the rest', () => {
    const header = `authToken=abc; pu_${PAGE}=tok%2E1; pu_not-a-uuid=x; theme=dark`;
    expect(readUnlockCookies(header)).toEqual({ [PAGE]: 'tok.1' });
    expect(readUnlockCookies(undefined)).toEqual({});
  });
});
