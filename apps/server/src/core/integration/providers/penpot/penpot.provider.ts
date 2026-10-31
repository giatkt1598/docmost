import { Injectable } from '@nestjs/common';
import {
  IntegrationProvider,
  IntegrationDefinition,
  LinkDescription,
  UnfurlOpts,
  UnfurlPattern,
  UnfurlResult,
} from '../../registry/integration-provider.interface';
import { PenpotService } from './penpot.service';
import { buildPenpotPatterns } from './penpot-patterns';
import { normalizeBaseUrl } from '../../utils/integration.utils';

const DEFAULT_BASE_URL = 'https://design.penpot.app';

@Injectable()
export class PenpotProvider extends IntegrationProvider {
  definition: IntegrationDefinition = {
    type: 'penpot',
    name: 'Penpot',
    description: 'Link previews for Penpot design files',
    icon: 'penpot',
    capabilities: ['unfurl'],
    setup: {
      auth: 'apiToken',
      baseUrl: 'optional',
      defaultBaseUrl: DEFAULT_BASE_URL,
      appRegistrationPath: '/#/settings/access-tokens',
    },
  };

  constructor(private readonly penpotService: PenpotService) {
    super();
  }

  getUnfurlPatterns(settings: Record<string, any>): UnfurlPattern[] {
    return buildPenpotPatterns(this.resolveBaseUrl(settings));
  }

  getUnfurlHosts(settings: Record<string, any>): string[] {
    return [new URL(this.resolveBaseUrl(settings)).hostname];
  }

  async verifyApiToken(
    token: string,
    settings: Record<string, any>,
  ): Promise<void> {
    await this.penpotService.verifyToken(token, this.resolveBaseUrl(settings));
  }

  async unfurl(opts: UnfurlOpts): Promise<UnfurlResult> {
    return this.penpotService.unfurlFile(
      opts.accessToken,
      this.resolveBaseUrl(opts.settings),
      opts.match[1],
      opts.url,
    );
  }

  describeLink(): LinkDescription {
    return { title: 'Penpot file' };
  }

  private resolveBaseUrl(settings?: Record<string, any>): string {
    const baseUrl = settings?.baseUrl;
    return (baseUrl && normalizeBaseUrl(baseUrl)) || DEFAULT_BASE_URL;
  }
}
