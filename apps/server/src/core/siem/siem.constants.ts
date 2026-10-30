export const SIEM_MAX_DESTINATIONS = 2;

export const SIEM_TYPES = ['http', 'splunk_hec', 'datadog'] as const;
export type SiemType = (typeof SIEM_TYPES)[number];

export const SIEM_STATUS = { HEALTHY: 'healthy', FAILING: 'failing' } as const;

export const DATADOG_SITES = [
  'datadoghq.com',
  'datadoghq.eu',
  'us3.datadoghq.com',
  'us5.datadoghq.com',
  'ap1.datadoghq.com',
  'ddog-gov.com',
];

export const SIEM_BATCH_SIZE = 500;
export const SIEM_MAX_BATCHES_PER_RUN = 20;
export const SIEM_SWEEP_INTERVAL_MS = 30 * 1000;

// Rows are inserted in batches by concurrent workers, so a newer row can commit
// before an older one. Reading only settled rows keeps the cursor from passing
// a row that is still in flight.
export const SIEM_SETTLE_WINDOW_MS = 10 * 1000;

// Failures before admins hear about it; shorter blips just retry.
export const SIEM_FAILING_THRESHOLD = 3;
export const SIEM_MAX_RETRY_DELAY_MS = 30 * 60 * 1000;
export const SIEM_DISABLE_AFTER_MS = 24 * 60 * 60 * 1000;
