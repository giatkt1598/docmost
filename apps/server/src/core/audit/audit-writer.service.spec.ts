import { ClsService } from 'nestjs-cls';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { AUDIT_CONTEXT_KEY } from '../../common/middlewares/audit-context.middleware';
import { AuditWriterService } from './audit-writer.service';
import { REDACTED } from './audit-sanitize';

const WORKSPACE_ID = '0198f0a0-0000-7000-8000-000000000001';
const USER_ID = '0198f0a0-0000-7000-8000-000000000002';
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(context?: Record<string, unknown>) {
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const cls = {
    isActive: jest.fn().mockReturnValue(!!context),
    get: jest.fn((key: string) =>
      key === AUDIT_CONTEXT_KEY ? context : undefined,
    ),
  };
  const repo = { setRetentionDays: jest.fn() };
  const service = new AuditWriterService(
    cls as unknown as ClsService,
    repo as any,
    queue as any,
  );
  return { service, queue, repo };
}

const payload = {
  event: AuditEvent.SPACE_UPDATED,
  resourceType: AuditResource.SPACE,
  resourceId: WORKSPACE_ID,
};

describe('AuditWriterService', () => {
  it('fills the row from the request context', () => {
    const { service, queue } = setup({
      workspaceId: WORKSPACE_ID,
      actorId: USER_ID,
      actorType: 'user',
      ipAddress: '203.0.113.9',
      userAgent: 'jest',
    });

    service.log(payload);

    const [, data] = queue.add.mock.calls[0];
    expect(data.rows[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      actorId: USER_ID,
      actorType: 'user',
      ipAddress: '203.0.113.9',
      userAgent: 'jest',
      event: AuditEvent.SPACE_UPDATED,
    });
  });

  it('records automation as its own actor type', () => {
    const context = { workspaceId: WORKSPACE_ID, actorType: 'user' };
    const { service, queue } = setup(context);

    service.setActorType('api_key');
    service.log(payload);

    expect(queue.add.mock.calls[0][1].rows[0].actorType).toBe('api_key');
  });

  it('drops excluded events', () => {
    const { service, queue } = setup({ workspaceId: WORKSPACE_ID });

    service.log({ ...payload, event: AuditEvent.SIEM_DESTINATION_TEST });

    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([
    AuditEvent.PAGE_CREATED,
    AuditEvent.PAGE_DUPLICATED,
    AuditEvent.PAGE_MOVED_TO_SPACE,
    AuditEvent.ATTACHMENT_UPLOADED,
  ])('records %s', (event) => {
    const { service, queue } = setup({ workspaceId: WORKSPACE_ID });

    service.log({ ...payload, event });

    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('skips a log call without a workspace instead of throwing', () => {
    const { service, queue } = setup();

    expect(() => service.log(payload)).not.toThrow();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('nulls values the typed columns would reject', () => {
    const { service, queue } = setup();

    service.logWithContext(
      { ...payload, resourceId: 'not-a-uuid', spaceId: 'nope' },
      { workspaceId: WORKSPACE_ID, actorId: 'bad', ipAddress: 'unknown' },
    );

    expect(queue.add.mock.calls[0][1].rows[0]).toMatchObject({
      resourceId: null,
      spaceId: null,
      actorId: null,
      ipAddress: null,
    });
  });

  it('redacts credentials in changes and metadata', () => {
    const { service, queue } = setup();

    service.logWithContext(
      {
        ...payload,
        changes: { after: { clientSecret: 'abc', name: 'kept' } },
        metadata: { nested: [{ accessToken: 'abc' }], tokenId: 'kept' },
      },
      { workspaceId: WORKSPACE_ID },
    );

    const row = queue.add.mock.calls[0][1].rows[0];
    expect(row.changes.after).toEqual({ clientSecret: REDACTED, name: 'kept' });
    expect(row.metadata).toEqual({
      nested: [{ accessToken: REDACTED }],
      tokenId: 'kept',
    });
  });

  it('never fails the caller when the queue is down', async () => {
    const { service, queue } = setup();
    queue.add.mockRejectedValue(new Error('redis down'));

    expect(() =>
      service.logWithContext(payload, { workspaceId: WORKSPACE_ID }),
    ).not.toThrow();
    await flush();
  });
});
