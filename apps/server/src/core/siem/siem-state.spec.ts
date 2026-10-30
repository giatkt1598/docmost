import { applyFailure } from './siem-state';

const now = new Date('2026-10-30T12:00:00Z');
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 60 * 60 * 1000);

describe('applyFailure', () => {
  it('retries quietly at first', () => {
    const result = applyFailure(
      { status: 'healthy', consecutiveFailures: 0, failingSince: null },
      now,
    );

    expect(result).toMatchObject({
      consecutiveFailures: 1,
      status: 'healthy',
      enabled: true,
      notify: null,
      failingSince: now,
    });
    expect(result.nextAttemptAt.getTime() - now.getTime()).toBe(60_000);
  });

  it('turns failing and notifies once at the threshold', () => {
    const first = applyFailure(
      { status: 'healthy', consecutiveFailures: 2, failingSince: hoursAgo(1) },
      now,
    );
    expect(first).toMatchObject({ status: 'failing', notify: 'failing' });

    const next = applyFailure(
      { status: 'failing', consecutiveFailures: 3, failingSince: hoursAgo(1) },
      now,
    );
    expect(next).toMatchObject({ status: 'failing', notify: null });
  });

  it('caps the retry delay at 30 minutes', () => {
    const result = applyFailure(
      { status: 'failing', consecutiveFailures: 20, failingSince: hoursAgo(5) },
      now,
    );
    expect(result.nextAttemptAt.getTime() - now.getTime()).toBe(1_800_000);
  });

  it('disables the destination after 24 hours', () => {
    const result = applyFailure(
      { status: 'failing', consecutiveFailures: 50, failingSince: hoursAgo(24) },
      now,
    );

    expect(result).toMatchObject({
      enabled: false,
      nextAttemptAt: null,
      notify: 'disabled',
    });
  });
});
