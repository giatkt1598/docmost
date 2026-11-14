import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Page, User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePasswordRepo } from '@docmost/db/repos/page/page-password.repo';
import { TokenService } from '../../auth/services/token.service';
import { PageAccessService } from '../page-access/page-access.service';
import { PageLockService } from '../page-access/page-lock.service';
import { CollabAccessService } from '../../../collaboration/services/collab-access.service';
import {
  comparePasswordHash,
  hashPassword,
} from '../../../common/helpers/utils';
import {
  PAGE_PASSWORD_INVALID,
  PAGE_UNLOCK_TTL,
} from '../page-access/page-lock.constants';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { NotificationType } from '../../notification/notification.constants';
import { NotificationService } from '../../notification/notification.service';
import { UserRole } from '../../../common/helpers/types/permission';

// The people who set a password: whoever created it and whoever last
// changed it.
function setterIds(
  row: { creatorId: string | null; updatedById: string | null } | undefined,
): string[] {
  if (!row) return [];
  return [...new Set([row.creatorId, row.updatedById].filter(Boolean))];
}

@Injectable()
export class PagePasswordService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePasswordRepo: PagePasswordRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly pageLock: PageLockService,
    private readonly tokenService: TokenService,
    private readonly collabAccessService: CollabAccessService,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly notificationService: NotificationService,
  ) {}

  // The lock state of pages the user can see, for the sidebar after an
  // unlock: { pageId: unlocked } for each protected one.
  async lockState(
    pageIds: string[],
    user: User,
    workspaceId: string,
  ): Promise<Record<string, boolean>> {
    if (pageIds.length === 0) return {};
    const rows = await this.db
      .selectFrom('pages')
      .select('id')
      .where('id', 'in', pageIds)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where(
        'spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(user.id),
      )
      .execute();
    const readable = await this.pagePermissionRepo.filterAccessiblePageIds({
      pageIds: rows.map((r) => r.id),
      userId: user.id,
    });
    return this.pageLock.lockState(readable);
  }

  private async findPage(pageId: string, workspaceId: string): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  // Who may manage a page's password: workspace admins (and the owner) and
  // the page's creator, who must also be able to edit it, and only from an
  // unlocked page: knowing the current password is part of being allowed to
  // change it.
  private async assertCanManage(page: Page, user: User) {
    const isAdmin =
      user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
    if (!isAdmin && page.creatorId !== user.id) {
      throw new ForbiddenException(
        'Only workspace admins and the page creator can manage its password',
      );
    }
    await this.pageAccessService.validateCanEdit(page, user);
    await this.pageLock.assertUnlocked(page);
  }

  // The workspace owner (only the owner, not admins) may reset or remove a
  // page's password without knowing it, e.g. when it is forgotten. It is an
  // override when the owner has not unlocked the page's own password; the
  // caller audits it and tells the page creator. Otherwise the usual checks
  // apply.
  private async authorizeManage(
    page: Page,
    user: User,
    allowOwnerOverride: boolean,
  ): Promise<{ ownerOverride: boolean }> {
    if (allowOwnerOverride && user.role === UserRole.OWNER) {
      const own = (await this.pageLock.lockSources(page.id)).find(
        (s) => !s.inherited,
      );
      if (own && (await this.pageLock.lockedSources([own])).length > 0) {
        return { ownerOverride: true };
      }
    }
    await this.assertCanManage(page, user);
    return { ownerOverride: false };
  }

  private issueUnlock(page: Page, version: number): Promise<string> {
    return this.tokenService.generatePageUnlockToken({
      pageId: page.id,
      workspaceId: page.workspaceId,
      version,
      expiresIn: PAGE_UNLOCK_TTL,
    });
  }

  // Sets or changes the password, and whether it covers the sub-pages.
  // A new password ends every earlier unlock and the caller gets a fresh
  // one; open editors of the page (and of its sub-pages) are rechecked.
  async setPassword(
    pageId: string,
    opts: { password?: string; includeSubPages?: boolean },
    user: User,
    workspaceId: string,
  ): Promise<{
    page: Page;
    unlockToken: string | null;
    ownerOverride: boolean;
    // who had set the password being replaced
    previousSetterIds: string[];
  }> {
    const page = await this.findPage(pageId, workspaceId);
    if (page.isBase) {
      throw new BadRequestException('A database cannot have a password');
    }
    // the owner may reset a forgotten password, never just toggle sub-pages
    const { ownerOverride } = await this.authorizeManage(
      page,
      user,
      !!opts.password,
    );

    const existing = await this.pagePasswordRepo.findByPageId(page.id);
    let unlockToken: string | null = null;
    if (opts.password) {
      const version = await this.pagePasswordRepo.upsert({
        pageId: page.id,
        workspaceId: page.workspaceId,
        spaceId: page.spaceId,
        passwordHash: await hashPassword(opts.password),
        includeSubPages:
          opts.includeSubPages ?? existing?.includeSubPages ?? false,
        userId: user.id,
      });
      unlockToken = await this.issueUnlock(page, version);
    } else if (existing && opts.includeSubPages !== undefined) {
      await this.pagePasswordRepo.setIncludeSubPages(
        page.id,
        opts.includeSubPages,
        user.id,
      );
    } else {
      throw new BadRequestException('Enter a password');
    }
    await this.collabAccessService.recheckAccess({ pageIds: [page.id] });

    return {
      page,
      unlockToken,
      ownerOverride,
      previousSetterIds: setterIds(existing),
    };
  }

  async removePassword(
    pageId: string,
    user: User,
    workspaceId: string,
  ): Promise<{
    page: Page;
    ownerOverride: boolean;
    previousSetterIds: string[];
  }> {
    const page = await this.findPage(pageId, workspaceId);
    const { ownerOverride } = await this.authorizeManage(page, user, true);
    const existing = await this.pagePasswordRepo.findByPageId(page.id);
    await this.pagePasswordRepo.deleteByPageId(page.id);
    return { page, ownerOverride, previousSetterIds: setterIds(existing) };
  }

  // Tells the people who set the password and the page creator that the
  // workspace owner reset or removed it without knowing it.
  async notifyOwnerOverride(
    page: Page,
    owner: User,
    action: 'reset' | 'removed',
    previousSetterIds: string[] = [],
  ): Promise<void> {
    const recipients = new Set(
      [page.creatorId, ...previousSetterIds].filter(
        (id): id is string => !!id && id !== owner.id,
      ),
    );
    for (const userId of recipients) {
      await this.notificationService.create({
        userId,
        workspaceId: page.workspaceId,
        type: NotificationType.PAGE_PASSWORD_OVERRIDDEN,
        actorId: owner.id,
        pageId: page.id,
        spaceId: page.spaceId,
        data: { action },
      });
    }
  }

  // Checks the password and returns an unlock for the current one. Also
  // used by share and public-space visitors, who are not signed in: the
  // unlock only lifts the password, every other access check still applies.
  async unlock(
    pageId: string,
    password: string,
    workspaceId: string,
  ): Promise<{ page: Page; unlockToken: string | null }> {
    const page = await this.findPage(pageId, workspaceId);
    const row = await this.pagePasswordRepo.findByPageId(page.id);
    if (!row) return { page, unlockToken: null };

    if (!(await comparePasswordHash(password, row.passwordHash))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: PAGE_PASSWORD_INVALID,
        message: 'Incorrect password',
      });
    }
    return { page, unlockToken: await this.issueUnlock(page, row.version) };
  }
}
