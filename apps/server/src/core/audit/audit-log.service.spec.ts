import { AuditEvent } from '../../common/events/audit-events';
import { AuditLogService } from './audit-log.service';

const NOW = new Date('2026-10-30T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const repo = {
    listWorkspaceRetention: jest.fn(),
    deleteOlderThan: jest.fn(),
    getRetentionDays: jest.fn(),
    findPage: jest.fn(),
    findResourceNames: jest.fn(),
  };
  const audit = { log: jest.fn(), updateRetention: jest.fn() };
  const service = new AuditLogService(repo as any, audit as any, {} as any);
  return { service, repo, audit };
}

describe('AuditLogService', () => {
  it('applies each workspace retention and the default', async () => {
    const { service, repo } = setup();
    repo.listWorkspaceRetention.mockResolvedValue([
      { id: 'a', auditRetentionDays: 30 },
      { id: 'b', auditRetentionDays: null },
    ]);
    repo.deleteOlderThan.mockResolvedValue(0);

    await service.cleanup(NOW);

    expect(repo.deleteOlderThan).toHaveBeenCalledWith(
      'a',
      new Date(NOW.getTime() - 30 * DAY),
      5000,
    );
    expect(repo.deleteOlderThan).toHaveBeenCalledWith(
      'b',
      new Date(NOW.getTime() - 365 * DAY),
      5000,
    );
  });

  it('keeps deleting until a batch comes up short', async () => {
    const { service, repo } = setup();
    repo.listWorkspaceRetention.mockResolvedValue([
      { id: 'a', auditRetentionDays: 30 },
    ]);
    repo.deleteOlderThan
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(12);

    await expect(service.cleanup(NOW)).resolves.toBe(5012);
    expect(repo.deleteOlderThan).toHaveBeenCalledTimes(2);
  });

  it('audits a retention change, not a repeat of the same value', async () => {
    const { service, repo, audit } = setup();
    repo.getRetentionDays.mockResolvedValue(90);

    await service.updateRetention('w', 90);
    expect(audit.log).not.toHaveBeenCalled();

    await service.updateRetention('w', 30);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEvent.WORKSPACE_UPDATED,
        changes: {
          before: { auditRetentionDays: 90 },
          after: { auditRetentionDays: 30 },
        },
      }),
    );
  });

  it('names the resources of a page of logs', async () => {
    const { service, repo } = setup();
    repo.findPage.mockResolvedValue({
      items: [
        { id: '1', resourceType: 'page', resourceId: 'p' },
        { id: '2', resourceType: 'api_key', resourceId: 'k' },
      ],
      meta: {},
    });
    repo.findResourceNames.mockResolvedValue([{ id: 'p', name: 'Title' }]);

    const result = await service.list({ id: 'w' } as any, { limit: 50 } as any);

    expect(repo.findResourceNames).toHaveBeenCalledWith('w', {
      page: ['p'],
      space: [],
      group: [],
      user: [],
    });
    expect(result.items[0].resource).toEqual({ id: 'p', name: 'Title' });
    expect(result.items[1].resource).toBeNull();
  });
});
