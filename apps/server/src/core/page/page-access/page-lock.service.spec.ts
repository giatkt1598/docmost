import { ForbiddenException } from '@nestjs/common';
import { PageLockService } from './page-lock.service';
import {
  PAGE_PASSWORD_REQUIRED,
  PAGE_UNLOCK_CLS_KEY,
  readUnlockCookies,
} from './page-lock.constants';

const PAGE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const OTHER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

function makeService(opts: {
  versions?: Record<string, number>;
  cookies?: Record<string, string>;
}) {
  const repo = {
    getVersions: jest.fn(async (ids: string[]) => {
      const map = new Map<string, number>();
      for (const id of ids) {
        if (opts.versions?.[id] !== undefined) map.set(id, opts.versions[id]);
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
    await expect(service.isLocked(PAGE, `${PAGE}:1`)).resolves.toBe(false);
  });

  it('reports the code and the title, never the content', async () => {
    const service = makeService({ versions: { [PAGE]: 1 } });
    const error = await service
      .assertUnlocked({ id: PAGE, title: 'Salaries', icon: null })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({
      code: PAGE_PASSWORD_REQUIRED,
      page: { id: PAGE, title: 'Salaries' },
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
