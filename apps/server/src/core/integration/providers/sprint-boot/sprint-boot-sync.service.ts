import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { EventName } from '../../../../common/events/event.contants';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import { IntegrationRepo } from '../../repos/integration.repo';
import { IntegrationConfigService } from '../../integration-config.service';
import { SprintBootService } from './sprint-boot.service';
import { resolveSprintBootUrl, SPRINT_BOOT_TYPE } from './sprint-boot.provider';
import { extractSprintBootUrls } from './sprint-boot-links';

export type SprintBootAccess = { token: string; baseUrl: string };

type PageEvent = { pageIds?: string[]; pageId?: string; workspaceId: string };

/**
 * Tells Sprint Boot which tickets each page mentions, so tickets list the pages about them. Sprint Boot replaces a
 * page's links with each report, so a lost report is mended by the next save.
 */
@Injectable()
export class SprintBootSyncService {
  private readonly logger = new Logger(SprintBootSyncService.name);

  constructor(
    private readonly integrationRepo: IntegrationRepo,
    private readonly configService: IntegrationConfigService,
    private readonly sprintBootService: SprintBootService,
    private readonly pageRepo: PageRepo,
    private readonly environmentService: EnvironmentService,
  ) {}

  async findAccess(workspaceId: string): Promise<SprintBootAccess | null> {
    const integration = await this.integrationRepo.findByWorkspaceAndType(
      workspaceId,
      SPRINT_BOOT_TYPE,
    );
    if (!integration) return null;
    const [credentials, settings] = await Promise.all([
      this.configService.findCredentials(workspaceId, SPRINT_BOOT_TYPE),
      this.configService.getSettings(workspaceId, SPRINT_BOOT_TYPE),
    ]);
    const baseUrl = resolveSprintBootUrl(settings);
    return credentials?.clientSecret && baseUrl
      ? { token: credentials.clientSecret, baseUrl }
      : null;
  }

  // Emitted a few seconds after a page's content is saved.
  @OnEvent(EventName.PAGE_CONTENT_SAVED)
  async onContentSaved(event: PageEvent) {
    await this.report(event, false);
  }

  @OnEvent(EventName.PAGE_RESTORED)
  async onRestored(event: PageEvent) {
    await this.report(event, false);
  }

  @OnEvent(EventName.PAGE_SOFT_DELETED)
  async onSoftDeleted(event: PageEvent) {
    await this.report(event, true);
  }

  @OnEvent(EventName.PAGE_DELETED)
  async onDeleted(event: PageEvent) {
    await this.report(event, true);
  }

  private async report(event: PageEvent, deleted: boolean) {
    const pageIds = event.pageIds ?? (event.pageId ? [event.pageId] : []);
    if (pageIds.length === 0 || !event.workspaceId) return;

    try {
      const access = await this.findAccess(event.workspaceId);
      if (!access) return;
      for (const pageId of pageIds) {
        await this.reportPage(access, pageId, deleted);
      }
    } catch (err) {
      // The next save reports the page again.
      this.logger.warn(
        `Could not report Sprint Boot links of ${pageIds.join(', ')}: ${(err as Error).message}`,
      );
    }
  }

  async reportPage(access: SprintBootAccess, pageId: string, deleted: boolean) {
    if (deleted) {
      await this.sprintBootService.setPageLinks(access.token, access.baseUrl, {
        pageId,
        deleted: true,
      });
      return;
    }

    const page = await this.pageRepo.findById(pageId, {
      includeContent: true,
      includeSpace: true,
    });
    if (!page || page.deletedAt) return;

    const space = (page as any).space as { slug?: string; name?: string } | undefined;
    const appUrl = this.environmentService.getAppUrl().replace(/\/+$/, '');
    const urls = extractSprintBootUrls(page.content, access.baseUrl);
    await this.sprintBootService.setPageLinks(access.token, access.baseUrl, {
      pageId: page.id,
      title: page.title || 'Untitled',
      url: space?.slug
        ? `${appUrl}/s/${encodeURIComponent(space.slug)}/p/${page.slugId}`
        : `${appUrl}/p/${page.slugId}`,
      spaceName: space?.name,
      urls,
    });
    this.logger.log(
      `Reported ${urls.length} Sprint Boot link(s) of page ${page.id}`,
    );
  }
}
