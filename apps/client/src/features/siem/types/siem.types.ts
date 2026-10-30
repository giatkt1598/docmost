export type SiemType = "http" | "splunk_hec" | "datadog";

export type SiemDestination = {
  id: string;
  name: string;
  type: SiemType;
  enabled: boolean;
  status: "healthy" | "failing";
  config: Record<string, any>;
  hasSecrets: { token: boolean; apiKey: boolean };
  lastDeliveredAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  nextAttemptAt: string | null;
  failingSince: string | null;
};

export type SiemDestinationValues = {
  type: SiemType;
  config: Record<string, any>;
  secrets: { token?: string; apiKey?: string };
};

export type SiemTestResult = {
  delivered: boolean;
  error?: string;
  statusCode?: number;
};

export const SIEM_TYPE_LABELS: Record<SiemType, string> = {
  http: "HTTP endpoint",
  splunk_hec: "Splunk HEC",
  datadog: "Datadog",
};

export const DATADOG_SITES = [
  "datadoghq.com",
  "datadoghq.eu",
  "us3.datadoghq.com",
  "us5.datadoghq.com",
  "ap1.datadoghq.com",
  "ddog-gov.com",
];
