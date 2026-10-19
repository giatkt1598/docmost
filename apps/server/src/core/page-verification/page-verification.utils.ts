import { add } from 'date-fns';

export const VERIFICATION_MODES = ['period', 'fixed', 'indefinite'] as const;
export type VerificationMode = (typeof VERIFICATION_MODES)[number];

export const PERIOD_UNITS = ['day', 'week', 'month', 'year'] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number];

export type VerificationStatus = 'verified' | 'expiring' | 'expired';

export const MAX_VERIFIERS = 5;
const MAX_REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const UNIT_TO_DURATION: Record<PeriodUnit, keyof Duration> = {
  day: 'days',
  week: 'weeks',
  month: 'months',
  year: 'years',
};

type Duration = {
  days?: number;
  weeks?: number;
  months?: number;
  years?: number;
};

export function addPeriod(
  from: Date,
  periodAmount: number,
  periodUnit: PeriodUnit,
): Date {
  return add(from, { [UNIT_TO_DURATION[periodUnit]]: periodAmount });
}

export function computeExpiresAt(opts: {
  mode: VerificationMode;
  from: Date;
  periodAmount?: number | null;
  periodUnit?: string | null;
  fixedExpiresAt?: Date | null;
}): Date | null {
  switch (opts.mode) {
    case 'period':
      return addPeriod(
        opts.from,
        opts.periodAmount,
        opts.periodUnit as PeriodUnit,
      );
    case 'fixed':
      return opts.fixedExpiresAt ?? null;
    case 'indefinite':
    default:
      return null;
  }
}

// Reminder starts min(7 days, half of the verification interval) before expiry.
export function reminderWindowMs(v: {
  verifiedAt: Date | null;
  expiresAt: Date | null;
}): number {
  if (!v.expiresAt) return 0;
  const start = v.verifiedAt ? new Date(v.verifiedAt).getTime() : null;
  const end = new Date(v.expiresAt).getTime();
  if (start === null || end <= start) return MAX_REMINDER_WINDOW_MS;
  return Math.min(MAX_REMINDER_WINDOW_MS, (end - start) / 2);
}

export function computeVerificationStatus(
  v: { verifiedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): VerificationStatus {
  if (!v.expiresAt) return 'verified';
  const remaining = new Date(v.expiresAt).getTime() - now.getTime();
  if (remaining <= 0) return 'expired';
  if (remaining <= reminderWindowMs(v)) return 'expiring';
  return 'verified';
}
