import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { PageService } from '../page/services/page.service';
import { PageAccessService } from '../page/page-access/page-access.service';
import { BaseService } from './base.service';
import { RowPageDto } from './dto/base.dto';

const MAX_TITLE_LENGTH = 200;

// Each row can open a page of its own for longer content (notes, a task
// description). The page is created on first use as a child of the base.
@Injectable()
export class BaseRowPageService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly baseService: BaseService,
    private readonly pageService: PageService,
    private readonly pageAccess: PageAccessService,
    private readonly pageRepo: PageRepo,
    private readonly propertyRepo: BasePropertyRepo,
    private readonly rowRepo: BaseRowRepo,
  ) {}

  async open(dto: RowPageDto, user: User, workspace: Workspace) {
    const { page: base, permissions } = await this.baseService.getViewablePage(
      dto.pageId,
      user,
      workspace,
    );
    const row = await this.rowRepo.findById(dto.rowId, base.id);
    if (!row) throw new NotFoundException('Row not found');

    const existing = await this.livePage(row.docPageId);
    if (existing) {
      await this.pageAccess.validateCanView(existing, user);
      return this.toResult(existing, false);
    }
    if (!permissions.canEdit) {
      throw new ForbiddenException('This row has no page yet');
    }

    const properties = await this.propertyRepo.findByPageId(base.id);
    const primary = properties.find((p) => p.isPrimary);
    const rawTitle = primary
      ? (row.cells as Record<string, unknown>)[primary.id]
      : null;
    const title =
      typeof rawTitle === 'string' && rawTitle.trim()
        ? rawTitle.trim().slice(0, MAX_TITLE_LENGTH)
        : undefined;

    const created = await this.pageService.create(user.id, workspace.id, {
      spaceId: base.spaceId,
      parentPageId: base.id,
      title,
    });
    const linked = await this.rowRepo.setDocPage(
      row.id,
      base.id,
      created.id,
      row.docPageId ?? null,
    );
    if (!linked) {
      // another request attached a page first: keep theirs
      await this.pageService.removePage(created.id, user.id, workspace.id);
      const fresh = await this.rowRepo.findById(row.id, base.id);
      const winner = await this.livePage(fresh?.docPageId);
      if (!winner) throw new NotFoundException('Row page not found');
      return this.toResult(winner, false);
    }
    return this.toResult(created, true);
  }

  private async livePage(pageId: string | null | undefined) {
    if (!pageId) return null;
    const page = await this.pageRepo.findById(pageId);
    return page && !page.deletedAt ? page : null;
  }

  private async toResult(page: Page, created: boolean) {
    const space = await this.db
      .selectFrom('spaces')
      .select(['slug'])
      .where('id', '=', page.spaceId)
      .executeTakeFirst();
    return {
      id: page.id,
      slugId: page.slugId,
      title: page.title,
      spaceSlug: space?.slug ?? null,
      created,
    };
  }
}
