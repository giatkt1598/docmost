import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PagePasswordService } from './page-password.service';
import { hashPassword } from '../../../common/helpers/utils';
import { PAGE_PASSWORD_INVALID } from '../page-access/page-lock.constants';

const user = { id: 'user_1' } as any;

function makeService(opts: {
  page?: Record<string, unknown> | null;
  row?: { passwordHash: string; version: number } | null;
}) {
  const page =
    opts.page === null
      ? null
      : {
          id: 'page_1',
          workspaceId: 'ws_1',
          spaceId: 'space_1',
          deletedAt: null,
          isBase: false,
          ...opts.page,
        };
  const pageRepo = { findById: jest.fn(async () => page) };
  const pagePasswordRepo = {
    findByPageId: jest.fn(async () => opts.row ?? undefined),
    upsert: jest.fn(async (_opts: any) => 4),
    setIncludeSubPages: jest.fn(async () => undefined),
    deleteByPageId: jest.fn(async () => undefined),
  };
  const pageAccessService = { validateCanEdit: jest.fn(async () => ({})) };
  const pageLock = { assertUnlocked: jest.fn(async () => undefined) };
  const tokenService = {
    generatePageUnlockToken: jest.fn(
      async (o: { pageId: string; version: number }) => `${o.pageId}:${o.version}`,
    ),
  };
  const collab = { recheckAccess: jest.fn(async () => undefined) };
  const service = new PagePasswordService(
    pageRepo as any,
    pagePasswordRepo as any,
    pageAccessService as any,
    pageLock as any,
    tokenService as any,
    collab as any,
  );
  return { service, pagePasswordRepo, pageAccessService, pageLock, collab };
}

describe('PagePasswordService', () => {
  it('sets a password only for an editor of an unlocked page', async () => {
    const { service, pagePasswordRepo, pageAccessService, pageLock, collab } =
      makeService({});
    const result = await service.setPassword('page_1', { password: 'hunter22' }, user, 'ws_1');

    expect(pageAccessService.validateCanEdit).toHaveBeenCalled();
    expect(pageLock.assertUnlocked).toHaveBeenCalled();
    const stored = pagePasswordRepo.upsert.mock.calls[0][0] as any;
    expect(stored.passwordHash).not.toBe('hunter22');
    // open editors with the old unlock are disconnected
    expect(collab.recheckAccess).toHaveBeenCalledWith({ pageIds: ['page_1'] });
    // the setter stays unlocked, for the new version
    expect(result.unlockToken).toBe('page_1:4');
  });

  it('turns sub-page cover on without a new password', async () => {
    const passwordHash = await hashPassword('hunter22');
    const { service, pagePasswordRepo, collab } = makeService({
      row: { passwordHash, version: 2 },
    });
    const result = await service.setPassword(
      'page_1',
      { includeSubPages: true },
      user,
      'ws_1',
    );
    expect(pagePasswordRepo.setIncludeSubPages).toHaveBeenCalledWith(
      'page_1',
      true,
      'user_1',
    );
    expect(pagePasswordRepo.upsert).not.toHaveBeenCalled();
    expect(collab.recheckAccess).toHaveBeenCalled();
    expect(result.unlockToken).toBeNull();
  });

  it('needs a password to protect a page the first time', async () => {
    const { service } = makeService({});
    await expect(
      service.setPassword('page_1', { includeSubPages: true }, user, 'ws_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a password on a database', async () => {
    const { service } = makeService({ page: { isBase: true } });
    await expect(
      service.setPassword('page_1', { password: 'hunter22' }, user, 'ws_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to manage a page that is still locked', async () => {
    const { service, pageLock, pagePasswordRepo } = makeService({});
    pageLock.assertUnlocked.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      service.removePassword('page_1', user, 'ws_1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(pagePasswordRepo.deleteByPageId).not.toHaveBeenCalled();
  });

  it('unlocks with the right password, for the current version', async () => {
    const passwordHash = await hashPassword('hunter22');
    const { service } = makeService({ row: { passwordHash, version: 7 } });
    await expect(service.unlock('page_1', 'hunter22', 'ws_1')).resolves.toMatchObject(
      { unlockToken: 'page_1:7' },
    );
  });

  it('answers a wrong password with PAGE_PASSWORD_INVALID, never 401', async () => {
    const passwordHash = await hashPassword('hunter22');
    const { service } = makeService({ row: { passwordHash, version: 1 } });
    const error = await service
      .unlock('page_1', 'wrong', 'ws_1')
      .catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({ code: PAGE_PASSWORD_INVALID });
  });

  it('does not reach pages of another workspace', async () => {
    const { service } = makeService({ page: { workspaceId: 'ws_2' } });
    await expect(service.unlock('page_1', 'x', 'ws_1')).rejects.toThrow(
      'Page not found',
    );
  });
});
