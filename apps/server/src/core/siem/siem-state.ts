import {
  SIEM_DISABLE_AFTER_MS,
  SIEM_FAILING_THRESHOLD,
  SIEM_MAX_RETRY_DELAY_MS,
  SIEM_STATUS,
} from './siem.constants';

export type FailureInput = {
  status: string;
  consecutiveFailures: number;
  failingSince: Date | null;
};

export type FailureOutcome = {
  consecutiveFailures: number;
  status: string;
  failingSince: Date;
  nextAttemptAt: Date | null;
  enabled: boolean;
  notify: 'failing' | 'disabled' | null;
};

// What a failed delivery does to a destination.
export function applyFailure(
  destination: FailureInput,
  now: Date,
): FailureOutcome {
  const consecutiveFailures = destination.consecutiveFailures + 1;
  const failingSince = destination.failingSince ?? now;
  const failing = consecutiveFailures >= SIEM_FAILING_THRESHOLD;

  if (now.getTime() - failingSince.getTime() >= SIEM_DISABLE_AFTER_MS) {
    return {
      consecutiveFailures,
      status: SIEM_STATUS.FAILING,
      failingSince,
      nextAttemptAt: null,
      enabled: false,
      notify: 'disabled',
    };
  }

  const delay = Math.min(
    60 * 1000 * 2 ** (consecutiveFailures - 1),
    SIEM_MAX_RETRY_DELAY_MS,
  );

  return {
    consecutiveFailures,
    status: failing ? SIEM_STATUS.FAILING : destination.status,
    failingSince,
    nextAttemptAt: new Date(now.getTime() + delay),
    enabled: true,
    notify:
      failing && destination.status !== SIEM_STATUS.FAILING ? 'failing' : null,
  };
}
