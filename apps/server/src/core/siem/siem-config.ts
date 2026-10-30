import { BadRequestException } from '@nestjs/common';
import { DATADOG_SITES, SiemType } from './siem.constants';

export type SiemTls = { rejectUnauthorized: boolean };

export type HttpConfig = {
  url: string;
  format: 'json' | 'ndjson';
  authHeaderName?: string;
  authHeaderPrefix?: string;
  tls?: SiemTls;
};

export type SplunkConfig = {
  url: string;
  channelId?: string;
  index?: string;
  source?: string;
  sourcetype?: string;
  host?: string;
  tls?: SiemTls;
};

export type DatadogConfig = {
  site: string;
  service?: string;
  tags?: string;
};

export type SiemConfig = HttpConfig | SplunkConfig | DatadogConfig;
export type SiemSecrets = { token?: string; apiKey?: string };

const HEADER_NAME = /^[A-Za-z0-9-]{1,100}$/;
const HEADER_VALUE = /^[\x20-\x7e]*$/;

function text(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !HEADER_VALUE.test(value)) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return value.trim() || undefined;
}

function httpUrl(value: unknown): string {
  const raw = text(value, 'URL');
  let parsed: URL;
  try {
    parsed = new URL(raw ?? '');
  } catch {
    throw new BadRequestException('A valid URL is required');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('The URL must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestException('Put credentials in the secret field');
  }
  return raw;
}

function tls(value: any): SiemTls | undefined {
  return value?.rejectUnauthorized === false
    ? { rejectUnauthorized: false }
    : undefined;
}

// Keeps only known fields, so nothing unexpected is stored or sent.
export function normalizeConfig(
  type: SiemType,
  config: Record<string, any>,
): SiemConfig {
  if (type === 'http') {
    const authHeaderName = text(config.authHeaderName, 'header name');
    if (authHeaderName && !HEADER_NAME.test(authHeaderName)) {
      throw new BadRequestException('Invalid header name');
    }
    if (config.format && !['json', 'ndjson'].includes(config.format)) {
      throw new BadRequestException('Invalid format');
    }
    return {
      url: httpUrl(config.url),
      format: config.format ?? 'json',
      authHeaderName,
      authHeaderPrefix: text(config.authHeaderPrefix, 'header prefix'),
      tls: tls(config.tls),
    };
  }

  if (type === 'splunk_hec') {
    return {
      url: httpUrl(config.url),
      channelId: text(config.channelId, 'channel'),
      index: text(config.index, 'index'),
      source: text(config.source, 'source'),
      sourcetype: text(config.sourcetype, 'source type'),
      host: text(config.host, 'host'),
      tls: tls(config.tls),
    };
  }

  if (!DATADOG_SITES.includes(config.site)) {
    throw new BadRequestException('Unknown Datadog site');
  }
  return {
    site: config.site,
    service: text(config.service, 'service'),
    tags: text(config.tags, 'tags'),
  };
}

export function normalizeSecrets(secrets?: Record<string, any>): SiemSecrets {
  return {
    token: text(secrets?.token, 'token'),
    apiKey: text(secrets?.apiKey, 'API key'),
  };
}

export function assertRequiredSecrets(type: SiemType, secrets: SiemSecrets) {
  if (type === 'splunk_hec' && !secrets.token) {
    throw new BadRequestException('A HEC token is required');
  }
  if (type === 'datadog' && !secrets.apiKey) {
    throw new BadRequestException('An API key is required');
  }
}
