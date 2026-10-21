import { BadRequestException } from '@nestjs/common';
import { PagePermissionService } from './page-permission.service';

const page = {
  id: 'p1',
  spaceId: 's1',
  workspaceId: 'ws',
  parentPageId: null,
} as any;
const user = { id: 'u1' } as any;

function setup(opts: { access?: any; writersAfter?: number } = {}) {
  const insertedRows: any[] = [];
  const repo = {
    findPageAccessByPageId: jest.fn().mockResolvedValue(opts.access),
    findRestrictedAncestor: jest.fn().mockResolvedValue(undefined),
    insertPageAccess: jest.fn().mockResolvedValue({ id: 'pa1' }),
    insertPagePermissions: jest.fn().mockResolvedValue(undefined),
    deletePageAccess: jest.fn(),
    deletePagePermissionsByUserIds: jest.fn(),
    deletePagePermissionsByGroupIds: jest.fn(),
    updatePagePermissionRole: jest.fn(),
    countWritersByPageAccessId: jest
      .fn()
      .mockResolvedValue(opts.writersAfter ?? 1),
  };
  // workspace filter: only u2 and g1 exist in the workspace
  const selectFrom = (table: string) => ({
    select: () => ({
      where: () => ({
        where: () => {
          const rows = table === 'users' ? [{ id: 'u2' }] : [{ id: 'g1' }];
          const q = {
            where: () => q,
            execute: async () => rows,
          };
          return q;
        },
      }),
    }),
  });
  const db = {
    transaction: () => ({ execute: (fn: any) => fn('trx') }),
    selectFrom,
    insertInto: () => ({
      values: (rows: any[]) => {
        insertedRows.push(...rows);
        return { onConflict: () => ({ execute: async () => undefined }) };
      },
    }),
  };
  const ws = {
    invalidateSpaceRestrictionCache: jest.fn(),
    removeBaseSubscribersWithoutAccess: jest.fn(),
  };
  const collab = { recheckAccess: jest.fn() };
  const audit = { log: jest.fn() };
  const pageAccess = {
    validateCanViewWithPermissions: jest
      .fn()
      .mockResolvedValue({ canEdit: true, hasRestriction: false }),
  };
  const service = new PagePermissionService(
    repo as any,
    {
      findById: jest.fn(),
      getPageAndDescendants: jest.fn().mockResolvedValue([{ id: 'p1' }]),
    } as any,
    pageAccess as any,
    ws as any,
    collab as any,
    db as any,
    audit as any,
    { del: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, repo, ws, collab, audit, insertedRows };
}

describe('PagePermissionService', () => {
  it('restricts a page and keeps the actor as writer', async () => {
    const { service, repo, ws, collab, audit } = setup();

    await service.restrict(page, user);

    expect(repo.insertPageAccess.mock.calls[0][0]).toMatchObject({
      pageId: 'p1',
      spaceId: 's1',
      accessLevel: 'restricted',
      creatorId: 'u1',
    });
    expect(repo.insertPagePermissions.mock.calls[0][0]).toEqual([
      { pageAccessId: 'pa1', userId: 'u1', role: 'writer', addedById: 'u1' },
    ]);
    expect(ws.invalidateSpaceRestrictionCache).toHaveBeenCalledWith('s1');
    expect(collab.recheckAccess).toHaveBeenCalledWith({ pageIds: ['p1'] });
    expect(audit.log.mock.calls[0][0].event).toBe('page.restricted');
  });

  it('refuses to restrict twice', async () => {
    const { service } = setup({ access: { id: 'pa1' } });
    await expect(service.restrict(page, user)).rejects.toThrow(
      'already restricted',
    );
  });

  it('only adds users and groups of the workspace', async () => {
    const { service, insertedRows } = setup({ access: { id: 'pa1' } });

    await service.addPermissions(
      {
        pageId: 'p1',
        role: 'reader' as any,
        userIds: ['u2', 'outsider'],
        groupIds: ['g1'],
      },
      page,
      user,
    );

    expect(insertedRows).toEqual([
      expect.objectContaining({ userId: 'u2', groupId: null, role: 'reader' }),
      expect.objectContaining({ userId: null, groupId: 'g1', role: 'reader' }),
    ]);
  });

  it('never removes or demotes the last writer', async () => {
    const removal = setup({ access: { id: 'pa1' }, writersAfter: 0 });
    await expect(
      removal.service.removePermissions(
        { pageId: 'p1', userIds: ['u1'] },
        page,
        user,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(removal.collab.recheckAccess).not.toHaveBeenCalled();

    const demotion = setup({ access: { id: 'pa1' }, writersAfter: 0 });
    await expect(
      demotion.service.updateRole(
        { pageId: 'p1', role: 'reader' as any, userId: 'u1' },
        page,
        user,
      ),
    ).rejects.toThrow('at least one writer');
  });

  it('requires exactly one target when changing a role', async () => {
    const { service } = setup({ access: { id: 'pa1' } });
    await expect(
      service.updateRole({ pageId: 'p1', role: 'writer' as any }, page, user),
    ).rejects.toThrow('either a userId or a groupId');
  });

  it('reports direct and inherited restrictions', async () => {
    const { service, repo } = setup({ access: { id: 'pa1' } });
    repo.findRestrictedAncestor.mockResolvedValue({ pageId: 'parent' });
    (service as any).pageRepo.findById.mockResolvedValue({
      id: 'parent',
      slugId: 'abc',
      title: 'Parent',
    });

    const info = await service.info({ ...page, parentPageId: 'parent' }, user);

    expect(info).toEqual({
      restrictionId: 'pa1',
      hasDirectRestriction: true,
      hasInheritedRestriction: true,
      inheritedFrom: { id: 'parent', slugId: 'abc', title: 'Parent' },
      userAccess: { canView: true, canEdit: true, canManage: true },
    });
    expect(repo.findRestrictedAncestor).toHaveBeenCalledWith('parent');
  });
});
