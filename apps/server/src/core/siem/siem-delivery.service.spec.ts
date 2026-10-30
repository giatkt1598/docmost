import { SiemDeliveryService } from './siem-delivery.service';

const EVENT = { id: 'e1' };
const LAST = { createdAt: new Date('2026-10-30T12:00:00Z'), id: 'e1' };

function setup(overrides: Record<string, unknown> = {}) {
  const destination = {
    id: 'd1',
    workspaceId: 'w1',
    name: 'Splunk',
    type: 'http',
    enabled: true,
    version: 3,
    status: 'healthy',
    consecutiveFailures: 0,
    failingSince: null,
    cursorCreatedAt: new Date('2026-10-30T11:00:00Z'),
    cursorId: 'c0',
    config: { url: 'https://siem.example' },
    secrets: 'encrypted',
    ...overrides,
  };
  const repo = {
    findById: jest.fn().mockResolvedValue(destination),
    readEvents: jest
      .fn()
      .mockResolvedValueOnce({ events: [EVENT], last: LAST })
      .mockResolvedValue({ events: [], last: null }),
    updateDelivery: jest.fn().mockResolvedValue(true),
    findOwnerIds: jest.fn().mockResolvedValue(['owner']),
    findDue: jest.fn().mockResolvedValue([{ id: 'd1' }]),
  };
  const transport = { send: jest.fn().mockResolvedValue(undefined) };
  const encryption = { decrypt: jest.fn().mockReturnValue('{"token":"t"}') };
  const notifications = {
    create: jest.fn().mockResolvedValue({ id: 'n1' }),
    queueEmail: jest.fn(),
  };
  const workspaceRepo = { findById: jest.fn().mockResolvedValue({}) };
  const domain = { getUrl: jest.fn().mockReturnValue('https://docs.example') };
  const queue = { add: jest.fn(), upsertJobScheduler: jest.fn() };

  const service = new SiemDeliveryService(
    repo as any,
    transport as any,
    encryption as any,
    notifications as any,
    workspaceRepo as any,
    domain as any,
    queue as any,
  );
  return { service, repo, transport, notifications, queue };
}

describe('SiemDeliveryService', () => {
  it('advances the cursor only after a successful send', async () => {
    const { service, repo, transport } = setup();

    await service.deliver('d1');

    expect(transport.send).toHaveBeenCalledWith(
      'http',
      { url: 'https://siem.example' },
      { token: 't' },
      [EVENT],
    );
    expect(repo.updateDelivery).toHaveBeenCalledWith(
      'd1',
      3,
      expect.objectContaining({ cursorCreatedAt: LAST.createdAt, cursorId: 'e1' }),
    );
  });

  it('reads only settled rows', async () => {
    const { service, repo } = setup();
    const before = Date.now();

    await service.deliver('d1');

    const settledBefore: Date = repo.readEvents.mock.calls[0][2];
    expect(settledBefore.getTime()).toBeLessThanOrEqual(before);
  });

  it('keeps the cursor when the destination rejects a batch', async () => {
    const { service, repo, transport } = setup();
    transport.send.mockRejectedValue(new Error('HTTP 500'));

    await service.deliver('d1');

    expect(repo.updateDelivery).toHaveBeenCalledTimes(1);
    const values = repo.updateDelivery.mock.calls[0][2];
    expect(values).not.toHaveProperty('cursorId');
    expect(values).toMatchObject({
      consecutiveFailures: 1,
      lastError: 'HTTP 500',
    });
  });

  it('stops when the configuration changed under a running delivery', async () => {
    const { service, repo, transport } = setup();
    repo.updateDelivery.mockResolvedValue(false);
    repo.readEvents.mockReset();
    repo.readEvents.mockResolvedValue({ events: [EVENT], last: LAST });

    await service.deliver('d1');

    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('skips a disabled destination', async () => {
    const { service, transport } = setup({ enabled: false });

    await service.deliver('d1');

    expect(transport.send).not.toHaveBeenCalled();
  });

  it('notifies owners when a destination starts failing', async () => {
    const { service, transport, notifications } = setup({
      consecutiveFailures: 2,
      failingSince: new Date(),
    });
    transport.send.mockRejectedValue(new Error('HTTP 500'));

    await service.deliver('d1');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner',
        type: 'siem_destination.failing',
      }),
    );
    expect(notifications.queueEmail).toHaveBeenCalled();
  });

  it('recovers and notifies after a delivery succeeds again', async () => {
    const { service, repo, notifications } = setup({
      status: 'failing',
      consecutiveFailures: 5,
      failingSince: new Date(),
    });

    await service.deliver('d1');

    expect(repo.updateDelivery).toHaveBeenLastCalledWith(
      'd1',
      3,
      expect.objectContaining({ status: 'healthy', consecutiveFailures: 0 }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'siem_destination.recovered' }),
    );
  });

  it('does not recover on an idle run', async () => {
    const { service, repo } = setup({
      status: 'failing',
      consecutiveFailures: 5,
    });
    repo.readEvents.mockReset();
    repo.readEvents.mockResolvedValue({ events: [], last: null });

    await service.deliver('d1');

    expect(repo.updateDelivery).not.toHaveBeenCalled();
  });

  it('queues one delivery per due destination', async () => {
    const { service, queue } = setup();

    await service.sweep();

    expect(queue.add).toHaveBeenCalledWith(
      'siem-deliver',
      { destinationId: 'd1' },
      { jobId: 'siem-deliver-d1' },
    );
  });
});
