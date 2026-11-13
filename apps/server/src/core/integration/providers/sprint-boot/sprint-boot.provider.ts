import { Injectable } from '@nestjs/common';
import {
  IntegrationDefinition,
  IntegrationProvider,
  LinkDescription,
  UnfurlOpts,
  UnfurlPattern,
  UnfurlResult,
} from '../../registry/integration-provider.interface';
import { normalizeBaseUrl } from '../../utils/integration.utils';
import { SprintBootService } from './sprint-boot.service';
import { buildSprintBootPatterns } from './sprint-boot-patterns';

export const SPRINT_BOOT_TYPE = 'sprint-boot';

// Sprint Boot hands the workspace one bridge secret; it unfurls tickets and hears which pages mention them.
@Injectable()
export class SprintBootProvider extends IntegrationProvider {
  definition: IntegrationDefinition = {
    type: SPRINT_BOOT_TYPE,
    name: 'Sprint Boot',
    description: 'Live ticket links, and the pages about each ticket shown in Sprint Boot',
    icon: 'sprint-boot',
    capabilities: ['unfurl', 'actions'],
    setup: {
      auth: 'apiToken',
      baseUrl: 'required',
      baseUrlPlaceholder: 'https://sprint-boot.example.com',
      appRegistrationPath: '/admin/docmost',
    },
  };

  constructor(private readonly sprintBootService: SprintBootService) {
    super();
  }

  getUnfurlPatterns(settings: Record<string, any>): UnfurlPattern[] {
    const baseUrl = resolveSprintBootUrl(settings);
    return baseUrl ? buildSprintBootPatterns(baseUrl) : [];
  }

  getUnfurlHosts(settings: Record<string, any>): string[] {
    const baseUrl = resolveSprintBootUrl(settings);
    return baseUrl ? [new URL(baseUrl).hostname] : [];
  }

  async verifyApiToken(
    token: string,
    settings: Record<string, any>,
  ): Promise<void> {
    await this.sprintBootService.verifyToken(
      token,
      resolveSprintBootUrl(settings)!,
    );
  }

  async unfurl(opts: UnfurlOpts): Promise<UnfurlResult> {
    return this.sprintBootService.unfurlTicket(
      opts.accessToken,
      resolveSprintBootUrl(opts.settings)!,
      opts.match[1].toUpperCase(),
      opts.url,
    );
  }

  describeLink(
    _patternType: string,
    match: RegExpMatchArray,
  ): LinkDescription {
    return { title: match[1].toUpperCase(), description: 'Sprint Boot ticket' };
  }
}

export function resolveSprintBootUrl(
  settings?: Record<string, any>,
): string | null {
  const baseUrl = settings?.baseUrl;
  return (baseUrl && normalizeBaseUrl(baseUrl)) || null;
}
