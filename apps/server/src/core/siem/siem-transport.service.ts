import { Injectable } from '@nestjs/common';
import { fetch as undiciFetch } from 'undici';
import { OutboundAgentFactory } from '../../integrations/outbound/outbound-agent.factory';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SiemEvent } from '@docmost/db/repos/siem/siem-destination.repo';
import {
  DatadogConfig,
  HttpConfig,
  SiemConfig,
  SiemSecrets,
  SiemTls,
  SplunkConfig,
} from './siem-config';
import { SiemType } from './siem.constants';

export class SiemDeliveryError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
  }
}

type Request = {
  url: string;
  headers: Record<string, string>;
  body: string;
  tls?: SiemTls;
};

export function buildRequest(
  type: SiemType,
  config: SiemConfig,
  secrets: SiemSecrets,
  events: SiemEvent[],
): Request {
  if (type === 'http') return buildHttp(config as HttpConfig, secrets, events);
  if (type === 'splunk_hec') {
    return buildSplunk(config as SplunkConfig, secrets, events);
  }
  return buildDatadog(config as DatadogConfig, secrets, events);
}

function buildHttp(
  config: HttpConfig,
  secrets: SiemSecrets,
  events: SiemEvent[],
): Request {
  const ndjson = config.format === 'ndjson';
  const headers: Record<string, string> = {
    'content-type': ndjson ? 'application/x-ndjson' : 'application/json',
  };
  if (secrets.token) {
    const name = config.authHeaderName || 'Authorization';
    const prefix = config.authHeaderPrefix ?? 'Bearer';
    headers[name] = prefix ? `${prefix} ${secrets.token}` : secrets.token;
  }
  return {
    url: config.url,
    headers,
    body: ndjson
      ? events.map((event) => JSON.stringify(event)).join('\n')
      : JSON.stringify(events),
    tls: config.tls,
  };
}

function buildSplunk(
  config: SplunkConfig,
  secrets: SiemSecrets,
  events: SiemEvent[],
): Request {
  const url = new URL(config.url);
  if (!url.pathname.includes('/services/collector')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/services/collector/event`;
  }
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Splunk ${secrets.token}`,
  };
  if (config.channelId) {
    headers['x-splunk-request-channel'] = config.channelId;
  }

  // HEC batches are concatenated objects, not a JSON array
  const body = events
    .map((event) =>
      JSON.stringify({
        time: new Date(event.timestamp).getTime() / 1000,
        source: config.source ?? 'docmost',
        sourcetype: config.sourcetype ?? 'docmost:audit',
        ...(config.index && { index: config.index }),
        ...(config.host && { host: config.host }),
        event,
      }),
    )
    .join('');

  return { url: url.toString(), headers, body, tls: config.tls };
}

function buildDatadog(
  config: DatadogConfig,
  secrets: SiemSecrets,
  events: SiemEvent[],
): Request {
  return {
    url: `https://http-intake.logs.${config.site}/api/v2/logs`,
    headers: {
      'content-type': 'application/json',
      'dd-api-key': secrets.apiKey,
    },
    body: JSON.stringify(
      events.map((event) => ({
        ddsource: 'docmost',
        service: config.service ?? 'docmost',
        ...(config.tags && { ddtags: config.tags }),
        message: event.event,
        docmost: event,
      })),
    ),
  };
}

@Injectable()
export class SiemTransportService {
  constructor(
    private readonly agentFactory: OutboundAgentFactory,
    private readonly environmentService: EnvironmentService,
  ) {}

  async send(
    type: SiemType,
    config: SiemConfig,
    secrets: SiemSecrets,
    events: SiemEvent[],
  ): Promise<void> {
    const request = buildRequest(type, config, secrets, events);
    const lease = await this.agentFactory.lease(request.url, {
      rejectUnauthorized:
        this.environmentService.isCloud() ||
        request.tls?.rejectUnauthorized !== false,
    });

    try {
      const response = await undiciFetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        dispatcher: lease.dispatcher,
        // a redirect could point past the address the guard validated
        redirect: 'error',
      });
      await response.body?.cancel();
      if (!response.ok) {
        // the status only: response bodies can echo the credential
        throw new SiemDeliveryError(
          `Destination returned HTTP ${response.status}`,
          response.status,
        );
      }
    } catch (err) {
      if (err instanceof SiemDeliveryError) throw err;
      const cause = (err as any)?.cause?.code ?? (err as Error)?.message;
      throw new SiemDeliveryError(`Could not reach destination: ${cause}`);
    } finally {
      await lease.release();
    }
  }
}
