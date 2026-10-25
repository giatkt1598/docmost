import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { jsonb } from '@docmost/db/repos/base/jsonb';
import { executeTx } from '@docmost/db/utils';
import {
  BaseProperty,
  BaseView,
  Page,
  User,
  Workspace,
} from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { BaseViewRepo } from '@docmost/db/repos/base/base-view.repo';
import { PageService } from '../page/services/page.service';
import { PageAccessService } from '../page/page-access/page-access.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { EventName } from '../../common/events/event.contants';
import { emitBaseEvent } from './base.events';
import { BaseTemplate, buildSeed } from './engine/templates';
import { ConvertBaseDto, CreateBaseDto, UpdateBaseDto } from './dto/base.dto';

type Permissions = { canEdit: boolean; hasRestriction: boolean };

@Injectable()
export class BaseService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly pageAccess: PageAccessService,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly propertyRepo: BasePropertyRepo,
    private readonly rowRepo: BaseRowRepo,
    private readonly viewRepo: BaseViewRepo,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // The page behind a base; accepts a page id or slug id.
  async getBasePage(pageId: string, workspaceId: string): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspaceId || page.deletedAt) {
      throw new NotFoundException('Base not found');
    }
    if (!page.isBase) throw new NotFoundException('Base not found');
    return page;
  }

  async getViewablePage(pageId: string, user: User, workspace: Workspace) {
    const page = await this.getBasePage(pageId, workspace.id);
    const permissions = await this.pageAccess.validateCanViewWithPermissions(
      page,
      user,
    );
    return { page, permissions };
  }

  async getEditablePage(pageId: string, user: User, workspace: Workspace) {
    const page = await this.getBasePage(pageId, workspace.id);
    await this.pageAccess.validateCanEdit(page, user);
    return page;
  }

  toBase(
    page: Page,
    properties: BaseProperty[],
    views: BaseView[],
    schemaVersion: number,
    permissions?: Permissions,
  ) {
    return {
      id: page.id,
      slugId: page.slugId,
      pageId: page.id,
      name: page.title ?? '',
      icon: page.icon ?? undefined,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      creatorId: page.creatorId,
      properties,
      views,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      baseSchemaVersion: schemaVersion,
      ...(permissions ? { permissions } : {}),
    };
  }

  async getInfo(page: Page, permissions?: Permissions) {
    const [properties, views, schemaVersion] = await Promise.all([
      this.propertyRepo.findByPageId(page.id),
      this.viewRepo.findByPageId(page.id),
      this.propertyRepo.getSchemaVersion(page.id),
    ]);
    return this.toBase(page, properties, views, schemaVersion, permissions);
  }

  async info(pageId: string, user: User, workspace: Workspace) {
    const { page, permissions } = await this.getViewablePage(
      pageId,
      user,
      workspace,
    );
    return this.getInfo(page, permissions);
  }

  async create(dto: CreateBaseDto, user: User, workspace: Workspace) {
    let parent: Page | undefined;
    let spaceId = dto.spaceId;

    if (dto.parentPageId) {
      parent = await this.pageRepo.findById(dto.parentPageId);
      if (!parent || parent.deletedAt || parent.workspaceId !== workspace.id) {
        throw new NotFoundException('Parent page not found');
      }
      spaceId = parent.spaceId;
      await this.pageAccess.validateCanEdit(parent, user);
    } else {
      if (!spaceId) throw new NotFoundException('Space not found');
      const ability = await this.spaceAbility.createForUser(user, spaceId);
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    const page = await executeTx(this.db, async (trx) => {
      const created = await this.pageService.create(
        user.id,
        workspace.id,
        {
          spaceId,
          parentPageId: parent?.id,
          title: dto.name,
          icon: dto.icon,
        },
        trx,
        true,
      );
      await this.seed(created.id, workspace.id, user.id, dto.template, trx);
      return created;
    });

    this.emit(EventName.BASE_CREATED, page.id, workspace.id, user.id);
    const permissions = await this.pageAccess.validateCanViewWithPermissions(
      page,
      user,
    );
    return this.getInfo(page, permissions);
  }

  async convert(dto: ConvertBaseDto, user: User, workspace: Workspace) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccess.validateCanEdit(page, user);

    if (!page.isBase) {
      await executeTx(this.db, async (trx) => {
        await this.pageRepo.updatePage({ isBase: true }, page.id, trx);
        await this.seed(page.id, workspace.id, user.id, dto.template, trx);
      });
      this.emit(EventName.BASE_CREATED, page.id, workspace.id, user.id);
    }
    return this.refreshedInfo(page.id, user, workspace);
  }

  async update(dto: UpdateBaseDto, user: User, workspace: Workspace) {
    const page = await this.getEditablePage(dto.pageId, user, workspace);
    const patch: { title?: string; icon?: string } = {};
    if (dto.name !== undefined) patch.title = dto.name;
    if (dto.icon !== undefined) patch.icon = dto.icon;
    if (Object.keys(patch).length > 0) {
      await this.pageRepo.updatePage(
        { ...patch, lastUpdatedById: user.id },
        page.id,
      );
    }
    this.emit(EventName.BASE_UPDATED, page.id, workspace.id, user.id);
    return this.refreshedInfo(page.id, user, workspace);
  }

  async remove(pageId: string, user: User, workspace: Workspace) {
    const page = await this.getEditablePage(pageId, user, workspace);
    await this.pageService.removePage(page.id, user.id, workspace.id);
    this.emit(EventName.BASE_DELETED, page.id, workspace.id, user.id);
  }

  private async refreshedInfo(pageId: string, user: User, workspace: Workspace) {
    const fresh = await this.getBasePage(pageId, workspace.id);
    const permissions = await this.pageAccess.validateCanViewWithPermissions(
      fresh,
      user,
    );
    return this.getInfo(fresh, permissions);
  }

  private emit(
    name: EventName,
    pageId: string,
    workspaceId: string,
    actorId: string,
  ) {
    emitBaseEvent(this.eventEmitter, name, { pageId, workspaceId, actorId });
  }

  // Bases of a space the user can open. No properties or views are loaded.
  async list(
    spaceId: string,
    user: User,
    workspace: Workspace,
    opts: { cursor?: string; limit?: number },
  ) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    const limit = opts.limit ?? 50;
    const offset = opts.cursor ? Number(opts.cursor) || 0 : 0;

    const pages = await this.db
      .selectFrom('pages')
      .select(['id'])
      .where('spaceId', '=', spaceId)
      .where('workspaceId', '=', workspace.id)
      .where('isBase', '=', true)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .offset(offset)
      .execute();
    const hasNextPage = pages.length > limit;
    if (hasNextPage) pages.pop();

    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: pages.map((p) => p.id),
        userId: user.id,
        spaceId,
      }),
    );
    const found = await this.pageRepo.findManyByIds(
      pages.filter((p) => accessible.has(p.id)).map((p) => p.id),
      { workspaceId: workspace.id },
    );
    return {
      items: found.map((p) => this.toBase(p, [], [], 0)),
      meta: {
        limit,
        hasNextPage,
        hasPrevPage: offset > 0,
        nextCursor: hasNextPage ? String(offset + limit) : null,
        prevCursor: offset > 0 ? String(Math.max(0, offset - limit)) : null,
      },
    };
  }

  // Properties, views and rows for a brand new base.
  async seed(
    pageId: string,
    workspaceId: string,
    userId: string,
    template: BaseTemplate | null | undefined,
    trx: KyselyTransaction,
  ) {
    const seed = buildSeed(template);
    await this.propertyRepo.insertMany(
      seed.properties.map((p) => ({
        id: p.id,
        pageId,
        workspaceId,
        name: p.name,
        type: p.type,
        typeOptions: jsonb(p.typeOptions),
        position: p.position,
        isPrimary: p.isPrimary,
      })),
      trx,
    );
    await this.viewRepo.insertMany(
      seed.views.map((v) => ({
        pageId,
        workspaceId,
        creatorId: userId,
        name: v.name,
        type: v.type,
        position: v.position,
        config: jsonb(v.config),
      })),
      trx,
    );
    await this.rowRepo.insertMany(
      seed.rows.map((r) => ({
        pageId,
        workspaceId,
        creatorId: userId,
        lastUpdatedById: userId,
        position: r.position,
        cells: jsonb(r.cells),
      })),
      trx,
    );
  }
}
