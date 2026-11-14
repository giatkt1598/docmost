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

@Injectable()
export class PagePasswordService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePasswordRepo: PagePasswordRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly pageLock: PageLockService,
    private readonly tokenService: TokenService,
    private readonly collabAccessService: CollabAccessService,
  ) {}

  private async findPage(pageId: string, workspaceId: string): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  // Editors manage the password, and only from an unlocked page: knowing
  // the current password is part of being allowed to change it.
  private async assertCanManage(page: Page, user: User) {
    await this.pageAccessService.validateCanEdit(page, user);
    await this.pageLock.assertUnlocked(page);
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
  ): Promise<{ page: Page; unlockToken: string | null }> {
    const page = await this.findPage(pageId, workspaceId);
    if (page.isBase) {
      throw new BadRequestException('A database cannot have a password');
    }
    await this.assertCanManage(page, user);

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

    return { page, unlockToken };
  }

  async removePassword(
    pageId: string,
    user: User,
    workspaceId: string,
  ): Promise<Page> {
    const page = await this.findPage(pageId, workspaceId);
    await this.assertCanManage(page, user);
    await this.pagePasswordRepo.deleteByPageId(page.id);
    return page;
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
