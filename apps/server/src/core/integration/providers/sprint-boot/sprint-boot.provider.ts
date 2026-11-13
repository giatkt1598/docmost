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
import { ModuleRef } from '@nestjs/core';
import { SprintBootSyncService } from './sprint-boot-sync.service';
import { SprintBootLinkService } from './sprint-boot-link.service';

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

  constructor(
    private readonly sprintBootService: SprintBootService,
    private readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  // Uninstalled here: Sprint Boot drops its side, and the API key it held is revoked.
  async onUninstall(opts: { workspaceId: string; settings: Record<string, any> }): Promise<void> {
    // Resolved late: both depend on the integration module this provider is registered with.
    const sync = this.moduleRef.get(SprintBootSyncService, { strict: false });
    const link = this.moduleRef.get(SprintBootLinkService, { strict: false });
    await link.revokeKey(opts.workspaceId, opts.settings);
    const access = await sync.findAccess(opts.workspaceId);
    if (access) {
      await this.sprintBootService.unlink(access.token, access.baseUrl);
    }
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
  // The bridge address pasted whole still means the Sprint Boot server it sits on.
  const normalized = (baseUrl && normalizeBaseUrl(baseUrl)) || null;
  return normalized?.replace(/\/api\/v1\/docs-bridge$/i, '') ?? null;
}
