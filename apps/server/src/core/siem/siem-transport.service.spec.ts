import { buildRequest } from './siem-transport.service';
import { SiemEvent } from '@docmost/db/repos/siem/siem-destination.repo';
import { assertRequiredSecrets, normalizeConfig } from './siem-config';

const event = {
  id: 'event-1',
  timestamp: '2026-10-30T12:00:00.000Z',
  event: 'user.login',
} as SiemEvent;

describe('buildRequest', () => {
  it('sends an HTTP array with a bearer token', () => {
    const request = buildRequest(
      'http',
      { url: 'https://siem.example/in', format: 'json' },
      { token: 'tok' },
      [event, event],
    );

    expect(request.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(request.body)).toHaveLength(2);
  });

  it('sends one line per event as ndjson', () => {
    const request = buildRequest(
      'http',
      {
        url: 'https://siem.example/in',
        format: 'ndjson',
        authHeaderName: 'X-Key',
      },
      { token: 'tok' },
      [event, event],
    );

    expect(request.headers['X-Key']).toBe('tok');
    expect(request.body.split('\n')).toHaveLength(2);
  });

  it('sends a raw token when the form leaves the prefix blank', () => {
    const config = normalizeConfig('http', {
      url: 'https://siem.example/in',
      authHeaderName: 'X-Api-Key',
      authHeaderPrefix: '',
    });

    const request = buildRequest('http', config, { token: 'tok' }, [event]);

    expect(request.headers['X-Api-Key']).toBe('tok');
  });

  it('keeps an explicit prefix on a custom header', () => {
    const request = buildRequest(
      'http',
      {
        url: 'https://siem.example/in',
        format: 'json',
        authHeaderName: 'X-Auth',
        authHeaderPrefix: 'Token',
      },
      { token: 'tok' },
      [event],
    );

    expect(request.headers['X-Auth']).toBe('Token tok');
  });

  it('targets the Splunk collector with concatenated events', () => {
    const request = buildRequest(
      'splunk_hec',
      { url: 'https://splunk.example:8088', index: 'audit' },
      { token: 'tok' },
      [event, event],
    );

    expect(request.url).toBe(
      'https://splunk.example:8088/services/collector/event',
    );
    expect(request.headers.authorization).toBe('Splunk tok');
    expect(request.body.split('}{"time"')).toHaveLength(2);
    expect(JSON.parse(request.body.split('}{"time"')[0] + '}')).toMatchObject({
      time: 1793361600,
      index: 'audit',
    });
  });

  it('derives the Datadog intake from the site', () => {
    const request = buildRequest(
      'datadog',
      { site: 'datadoghq.eu', tags: 'env:prod' },
      { apiKey: 'key' },
      [event],
    );

    expect(request.url).toBe(
      'https://http-intake.logs.datadoghq.eu/api/v2/logs',
    );
    expect(request.headers['dd-api-key']).toBe('key');
    expect(JSON.parse(request.body)[0]).toMatchObject({
      ddtags: 'env:prod',
      message: 'user.login',
    });
  });
});

describe('normalizeConfig', () => {
  it('drops unknown fields', () => {
    expect(
      normalizeConfig('datadog', { site: 'datadoghq.com', evil: 'x' }),
    ).not.toHaveProperty('evil');
  });

  it.each([
    ['http', { url: 'ftp://siem.example' }],
    ['http', { url: 'https://user:pass@siem.example' }],
    ['http', { url: 'https://siem.example', authHeaderName: 'bad header' }],
    ['http', { url: 'https://siem.example', authHeaderPrefix: 'a\r\nb' }],
    ['datadog', { site: 'attacker.example' }],
  ] as const)('rejects %s %j', (type, config) => {
    expect(() => normalizeConfig(type, config)).toThrow();
  });
});

describe('assertRequiredSecrets', () => {
  it('requires the credential each type needs', () => {
    expect(() => assertRequiredSecrets('splunk_hec', {})).toThrow();
    expect(() => assertRequiredSecrets('datadog', {})).toThrow();
    expect(() => assertRequiredSecrets('http', {})).not.toThrow();
  });
});
