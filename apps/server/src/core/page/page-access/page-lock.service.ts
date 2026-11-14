import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  LockSource,
  PagePasswordRepo,
} from '@docmost/db/repos/page/page-password.repo';
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
};

// Decides whether the content of a password-protected page may be read in
// the current request. A page is protected by its own password and by the
// passwords of ancestors that cover their sub-pages; it is readable once the
// request carries a valid unlock (cookie, or tokens passed in, as the
// collaboration socket does) for every one of them. Everyone, editors
// included, must unlock.
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

  // The unlock token the current request carries for a page, if any.
  contextToken(pageId: string): string | undefined {
    return this.contextTokens()[pageId];
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

  // Unlock tokens by the page they unlock, from a list of raw tokens.
  async tokensByPage(tokens: string[]): Promise<Record<string, string>> {
    const byPage: Record<string, string> = {};
    for (const token of tokens) {
      try {
        const payload = await this.tokenService.verifyJwt(
          token,
          JwtType.PAGE_UNLOCK,
        );
        byPage[payload.pageId] = token;
      } catch {
        // not an unlock token
      }
    }
    return byPage;
  }

  async lockSources(pageId: string): Promise<LockSource[]> {
    return (await this.pagePasswordRepo.getLockSources([pageId])).get(pageId) ?? [];
  }

  async isProtected(pageId: string): Promise<boolean> {
    return (await this.lockSources(pageId)).length > 0;
  }

  // The sources among `sources` this request has not unlocked.
  async lockedSources(
    sources: LockSource[],
    extraTokens: Record<string, string> = {},
  ): Promise<LockSource[]> {
    const tokens = { ...this.contextTokens(), ...extraTokens };
    const locked: LockSource[] = [];
    for (const source of sources) {
      if (
        !(await this.isValidUnlock(
          tokens[source.pageId],
          source.pageId,
          source.version,
        ))
      ) {
        locked.push(source);
      }
    }
    return locked;
  }

  // The protected pages among `pageIds` this request has not fully unlocked.
  async lockedPageIds(
    pageIds: string[],
    extraTokens: Record<string, string> = {},
  ): Promise<Set<string>> {
    const locked = new Set<string>();
    const all = await this.pagePasswordRepo.getLockSources(pageIds);
    for (const [pageId, sources] of all) {
      if ((await this.lockedSources(sources, extraTokens)).length > 0) {
        locked.add(pageId);
      }
    }
    return locked;
  }

  async isLocked(
    pageId: string,
    extraTokens: Record<string, string> = {},
  ): Promise<boolean> {
    return (await this.lockedPageIds([pageId], extraTokens)).has(pageId);
  }

  // Throws a 403 with code PAGE_PASSWORD_REQUIRED naming the page whose
  // password to enter: the page itself or the ancestor that protects it.
  // Only titles come along; the content is the secret.
  async assertUnlocked(
    page: LockablePage,
    extraTokens: Record<string, string> = {},
  ): Promise<void> {
    const sources = await this.lockSources(page.id);
    if (sources.length === 0) return;
    const locked = await this.lockedSources(sources, extraTokens);
    if (locked.length > 0) throw this.passwordRequired(page, locked[0]);
  }

  // Throws while any of `sources` is locked, e.g. the passwords a page
  // would enter or leave when moved.
  async assertSourcesUnlocked(sources: LockSource[]): Promise<void> {
    const locked = await this.lockedSources(sources);
    if (locked.length > 0) {
      const source = locked[0];
      throw this.passwordRequired(
        { id: source.pageId, title: source.title, icon: source.icon },
        source,
      );
    }
  }

  // The passwords a page placed under `parentPageId` would be covered by.
  async sourcesForChildOf(parentPageId: string | null): Promise<LockSource[]> {
    if (!parentPageId) return [];
    return (await this.lockSources(parentPageId)).filter(
      (s) => s.includeSubPages,
    );
  }

  private passwordRequired(page: LockablePage, source: LockSource) {
    return new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: PAGE_PASSWORD_REQUIRED,
      message: 'This page is protected by a password',
      // the page whose password unlocks this one
      page: { id: source.pageId, title: source.title, icon: source.icon },
      // the page that was asked for
      requestedPage: {
        id: page.id,
        title: page.title ?? null,
        icon: page.icon ?? null,
      },
    });
  }
}
