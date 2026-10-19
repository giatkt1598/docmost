import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PageVerificationService } from './page-verification.service';
import { PageVerificationScheduler } from './page-verification.scheduler';
import {
  computeExpiresAt,
  computeVerificationStatus,
} from './page-verification.utils';
import { QueueJob } from '../../integrations/queue/constants';

const DAY = 24 * 60 * 60 * 1000;
const user = { id: 'user_1' } as any;
const workspace = { id: 'ws_1' } as any;
const page = {
  id: 'page_1',
  spaceId: 'space_1',
  workspaceId: 'ws_1',
  title: 'Runbook',
};

function verification(overrides: Record<string, any> = {}) {
  return {
    id: 'ver_1',
    pageId: 'page_1',
    type: 'expiring',
    mode: 'period',
    periodAmount: 30,
    periodUnit: 'day',
    verifiedAt: new Date(Date.now() - DAY),
    expiresAt: new Date(Date.now() + 29 * DAY),
    verifiers: [{ id: 'user_1' }, { id: 'user_2' }],
    verifiedBy: null,
    ...overrides,
  } as any;
}

describe('page verification utils', () => {
  const from = new Date('2026-01-01T00:00:00Z');

  it('computes expiry for each mode', () => {
    expect(
      computeExpiresAt({
        mode: 'period',
        from,
        periodAmount: 2,
        periodUnit: 'week',
      }),
    ).toEqual(new Date('2026-01-15T00:00:00Z'));
    const fixed = new Date('2026-06-01T00:00:00Z');
    expect(
      computeExpiresAt({ mode: 'fixed', from, fixedExpiresAt: fixed }),
    ).toEqual(fixed);
    expect(computeExpiresAt({ mode: 'indefinite', from })).toBeNull();
  });

  it('derives the status from the expiry date', () => {
    const now = new Date('2026-01-20T00:00:00Z');
    const verifiedAt = new Date('2026-01-01T00:00:00Z');

    expect(
      computeVerificationStatus({ verifiedAt, expiresAt: null }, now),
    ).toBe('verified');
    expect(
      computeVerificationStatus(
        { verifiedAt, expiresAt: new Date('2026-03-01T00:00:00Z') },
        now,
      ),
    ).toBe('verified');
    // within the 7 day reminder window
    expect(
      computeVerificationStatus(
        { verifiedAt, expiresAt: new Date('2026-01-25T00:00:00Z') },
        now,
      ),
    ).toBe('expiring');
    expect(
      computeVerificationStatus(
        { verifiedAt, expiresAt: new Date('2026-01-19T00:00:00Z') },
        now,
      ),
    ).toBe('expired');
  });

  it('shrinks the reminder window for short intervals', () => {
    const verifiedAt = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date('2026-01-03T00:00:00Z'); // 2 day interval

    expect(
      computeVerificationStatus(
        { verifiedAt, expiresAt },
        new Date('2026-01-01T12:00:00Z'),
      ),
    ).toBe('verified');
    expect(
      computeVerificationStatus(
        { verifiedAt, expiresAt },
        new Date('2026-01-02T12:00:00Z'),
      ),
    ).toBe('expiring');
  });
});

function createService(current?: any) {
  const deps = {
    pageRepo: { findById: jest.fn().mockResolvedValue(page) },
    pageVerificationRepo: {
      findByPageId: jest.fn().mockResolvedValue(current),
      insert: jest.fn().mockResolvedValue({ id: 'ver_new' }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      replaceVerifiers: jest.fn().mockResolvedValue(undefined),
      deleteReminderNotifications: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(),
    },
    spaceMemberRepo: {
      getUserIdsWithSpaceAccess: jest.fn(async (ids: string[]) => new Set(ids)),
      getUserSpaceIds: jest.fn().mockResolvedValue(['space_1']),
    },
    pagePermissionRepo: {
      getUserIdsWithPageAccess: jest.fn(async (_pageId, ids) => ids),
      filterAccessiblePageIds: jest.fn(),
    },
    pageAccessService: {
      validateCanView: jest.fn().mockResolvedValue(undefined),
      validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
    },
    wsService: { emitCommentEvent: jest.fn().mockResolvedValue(undefined) },
    notificationQueue: { add: jest.fn().mockResolvedValue(undefined) },
    auditService: { log: jest.fn() },
  };
  const service = new PageVerificationService(
    deps.pageRepo as any,
    deps.pageVerificationRepo as any,
    deps.spaceMemberRepo as any,
    deps.pagePermissionRepo as any,
    deps.pageAccessService as any,
    deps.wsService as any,
    deps.notificationQueue as any,
    deps.auditService as any,
  );
  return { service, deps };
}

describe('PageVerificationService', () => {
  it('reports none with manage permission when no verification exists', async () => {
    const { service } = createService(undefined);

    const info = await service.getInfo('page_1', user, workspace);

    expect(info).toMatchObject({
      status: 'none',
      permissions: { canManage: true, canVerify: false },
    });
  });

  it('create requires edit access to the page', async () => {
    const { service, deps } = createService(undefined);
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.create(
        { pageId: 'page_1', mode: 'indefinite', verifierIds: ['user_1'] },
        user,
        workspace,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageVerificationRepo.insert).not.toHaveBeenCalled();
  });

  it('create rejects verifiers without access to the page', async () => {
    const { service, deps } = createService(undefined);
    deps.pagePermissionRepo.getUserIdsWithPageAccess.mockResolvedValue([
      'user_1',
    ]);

    await expect(
      service.create(
        {
          pageId: 'page_1',
          mode: 'indefinite',
          verifierIds: ['user_1', 'outsider'],
        },
        user,
        workspace,
      ),
    ).rejects.toThrow('All verifiers must have access');
    expect(deps.pageVerificationRepo.insert).not.toHaveBeenCalled();
  });

  it('create counts as the first verification', async () => {
    const { service, deps } = createService(undefined);

    await service.create(
      {
        pageId: 'page_1',
        mode: 'period',
        periodAmount: 30,
        periodUnit: 'day',
        verifierIds: ['user_2', 'user_1'],
      },
      user,
      workspace,
    );

    const row = deps.pageVerificationRepo.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      type: 'expiring',
      mode: 'period',
      verifiedById: 'user_1',
      spaceId: 'space_1',
    });
    expect(row.expiresAt.getTime() - row.verifiedAt.getTime()).toBe(30 * DAY);
    expect(deps.pageVerificationRepo.replaceVerifiers).toHaveBeenCalledWith(
      'ver_new',
      ['user_2', 'user_1'],
      'user_1',
    );
    expect(deps.auditService.log).toHaveBeenCalled();
    expect(deps.wsService.emitCommentEvent).toHaveBeenCalledWith(
      'space_1',
      'page_1',
      { operation: 'verificationUpdated', pageId: 'page_1' },
    );
  });

  it('create rejects a fixed date in the past', async () => {
    const { service } = createService(undefined);

    await expect(
      service.create(
        {
          pageId: 'page_1',
          mode: 'fixed',
          fixedExpiresAt: new Date(Date.now() - DAY).toISOString(),
          verifierIds: ['user_1'],
        },
        user,
        workspace,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('only verifiers can verify', async () => {
    const { service, deps } = createService(
      verification({ verifiers: [{ id: 'user_2' }] }),
    );

    await expect(service.verify('page_1', user, workspace)).rejects.toThrow(
      ForbiddenException,
    );
    expect(deps.pageVerificationRepo.update).not.toHaveBeenCalled();
  });

  it('verify restarts the period, clears reminders and notifies others', async () => {
    const { service, deps } = createService(
      verification({ expiresAt: new Date(Date.now() - DAY) }),
    );

    await service.verify('page_1', user, workspace);

    const [id, update] = deps.pageVerificationRepo.update.mock.calls[0];
    expect(id).toBe('ver_1');
    expect(update.verifiedById).toBe('user_1');
    expect(update.expiresAt.getTime() - update.verifiedAt.getTime()).toBe(
      30 * DAY,
    );
    expect(
      deps.pageVerificationRepo.deleteReminderNotifications,
    ).toHaveBeenCalledWith('ver_1', [
      'page.verification_expiring',
      'page.verification_expired',
    ]);
    expect(deps.notificationQueue.add).toHaveBeenCalledWith(
      QueueJob.PAGE_VERIFIED_NOTIFICATION,
      expect.objectContaining({ actorId: 'user_1', verifierIds: ['user_2'] }),
    );
  });

  it('verify requires a new date once a fixed expiry has passed', async () => {
    const { service, deps } = createService(
      verification({
        mode: 'fixed',
        periodAmount: null,
        periodUnit: null,
        expiresAt: new Date(Date.now() - DAY),
      }),
    );

    await expect(service.verify('page_1', user, workspace)).rejects.toThrow(
      'Set a new expiry date',
    );
    expect(deps.pageVerificationRepo.update).not.toHaveBeenCalled();
  });

  it('remove requires edit access', async () => {
    const { service, deps } = createService(verification());
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(service.remove('page_1', user, workspace)).rejects.toThrow(
      ForbiddenException,
    );
    expect(deps.pageVerificationRepo.delete).not.toHaveBeenCalled();
  });

  it('list hides verifications on pages the user cannot see', async () => {
    const { service, deps } = createService();
    deps.pageVerificationRepo.list.mockResolvedValue({
      items: [
        { ...verification(), pageId: 'page_1' },
        { ...verification({ id: 'ver_2' }), pageId: 'secret' },
      ],
      meta: {},
    });
    deps.pagePermissionRepo.filterAccessiblePageIds.mockResolvedValue([
      'page_1',
    ]);

    const result = await service.list({}, user, workspace);

    expect(result.items.map((i) => i.id)).toEqual(['ver_1']);
    expect(result.items[0].status).toBe('verified');
  });
});

describe('PageVerificationScheduler.reconcile', () => {
  it('queues expiring and expired reminders only', async () => {
    const now = new Date('2026-01-20T00:00:00Z');
    const repo = {
      findExpiringBefore: jest.fn().mockResolvedValue([
        {
          id: 'expired',
          verifiedAt: new Date('2025-12-01T00:00:00Z'),
          expiresAt: new Date('2026-01-10T00:00:00Z'),
        },
        {
          id: 'soon',
          verifiedAt: new Date('2025-12-25T00:00:00Z'),
          expiresAt: new Date('2026-01-24T00:00:00Z'),
        },
        {
          // short interval, outside its narrower window
          id: 'fresh',
          verifiedAt: new Date('2026-01-19T00:00:00Z'),
          expiresAt: new Date('2026-01-25T00:00:00Z'),
        },
      ]),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new PageVerificationScheduler(repo as any, queue as any);

    await scheduler.reconcile(now);

    expect(queue.add.mock.calls).toEqual([
      [QueueJob.PAGE_VERIFICATION_EXPIRED, { verificationId: 'expired' }],
      [QueueJob.PAGE_VERIFICATION_EXPIRING, { verificationId: 'soon' }],
    ]);
  });
});
