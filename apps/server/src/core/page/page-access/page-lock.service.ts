import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PagePasswordRepo } from '@docmost/db/repos/page/page-password.repo';
import { TokenService } from '../../auth/services/token.service';
import { JwtType } from '../../auth/dto/jwt-payload';
import {
  PAGE_PASSWORD_REQUIRED,
  PAGE_UNLOCK_CLS_KEY,
} from './page-lock.constants';

type LockablePage = {
  id: string;
  title?: string | null;
  icon?: string | null;
  workspaceId?: string;
};

// Decides whether the content of a password-protected page may be read in
// the current request: the page has no password, or the request carries a
// valid unlock for its current password (cookie, or a token passed in, as
// the collaboration socket does). Everyone, editors included, must unlock.
@Injectable()
export class PageLockService {
  constructor(
    private readonly pagePasswordRepo: PagePasswordRepo,
    private readonly tokenService: TokenService,
    private readonly cls: ClsService,
  ) {}

  private contextTokens(): Record<string, string> {
    try {
      return this.cls.get<Record<string, string>>(PAGE_UNLOCK_CLS_KEY) ?? {};
    } catch {
      // outside a request context
      return {};
    }
  }

  async isValidUnlock(
    token: string | undefined,
    pageId: string,
    version: number,
  ): Promise<boolean> {
    if (!token) return false;
    try {
      const payload = await this.tokenService.verifyJwt(
        token,
        JwtType.PAGE_UNLOCK,
      );
      return payload.pageId === pageId && payload.pv === version;
    } catch {
      return false;
    }
  }

  // The unlock token the current request carries for a page, if any.
  contextToken(pageId: string): string | undefined {
    return this.contextTokens()[pageId];
  }

  async hasPassword(pageId: string): Promise<boolean> {
    const versions = await this.pagePasswordRepo.getVersions([pageId]);
    return versions.has(pageId);
  }

  // The protected pages among `pageIds` this request has not unlocked.
  async lockedPageIds(
    pageIds: string[],
    extraTokens: Record<string, string> = {},
  ): Promise<Set<string>> {
    const locked = new Set<string>();
    const unique = [...new Set(pageIds.filter(Boolean))];
    const versions = await this.pagePasswordRepo.getVersions(unique);
    if (versions.size === 0) return locked;
    const tokens = { ...this.contextTokens(), ...extraTokens };
    await Promise.all(
      [...versions].map(async ([pageId, version]) => {
        if (!(await this.isValidUnlock(tokens[pageId], pageId, version))) {
          locked.add(pageId);
        }
      }),
    );
    return locked;
  }

  async isLocked(pageId: string, token?: string): Promise<boolean> {
    const locked = await this.lockedPageIds(
      [pageId],
      token ? { [pageId]: token } : {},
    );
    return locked.has(pageId);
  }

  // Throws a 403 with code PAGE_PASSWORD_REQUIRED while the page is locked.
  // The title and icon come along: only the content is secret.
  async assertUnlocked(page: LockablePage, token?: string): Promise<void> {
    if (await this.isLocked(page.id, token)) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: PAGE_PASSWORD_REQUIRED,
        message: 'This page is protected by a password',
        page: { id: page.id, title: page.title ?? null, icon: page.icon ?? null },
      });
    }
  }
}
