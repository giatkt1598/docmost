import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Page, User } from '@docmost/db/types/entity.types';
import { executeTx } from '@docmost/db/utils';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import {
  PageAccessLevel,
  PagePermissionRole,
} from '../../../common/helpers/types/permission';
import {
  AuditEvent,
  AuditEventType,
  AuditResource,
} from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { WsService } from '../../../ws/ws.service';
import { CollabAccessService } from '../../../collaboration/services/collab-access.service';
import { PageAccessService } from '../page-access/page-access.service';
import {
  AddPagePermissionDto,
  RemovePagePermissionDto,
  UpdatePagePermissionRoleDto,
} from './dto/page-permission.dto';

const LAST_WRITER = 'A restricted page needs at least one writer';

// Who may view and edit an individual page. A restricted page is visible
// only to the users and groups listed on it (on top of space membership),
// and the restriction applies to all of its descendants.
@Injectable()
export class PagePermissionService {
  constructor(
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly wsService: WsService,
    private readonly collabAccessService: CollabAccessService,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async info(page: Page, user: User) {
    const { canEdit } =
      await this.pageAccessService.validateCanViewWithPermissions(page, user);
    const [direct, inherited] = await Promise.all([
      this.pagePermissionRepo.findPageAccessByPageId(page.id),
      page.parentPageId
        ? this.pagePermissionRepo.findRestrictedAncestor(page.parentPageId)
        : undefined,
    ]);

    let inheritedFrom: { id: string; slugId: string; title: string } | null =
      null;
    if (inherited) {
      const ancestor = await this.pageRepo.findById(inherited.pageId);
      if (ancestor) {
        inheritedFrom = {
          id: ancestor.id,
          slugId: ancestor.slugId,
          title: ancestor.title,
        };
      }
    }

    return {
      restrictionId: direct?.id ?? null,
      hasDirectRestriction: !!direct,
      hasInheritedRestriction: !!inherited,
      inheritedFrom,
      userAccess: { canView: true, canEdit, canManage: canEdit },
    };
  }

  async list(page: Page, pagination: PaginationOptions) {
    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!access) {
      return { items: [], meta: { hasNextPage: false, hasPrevPage: false } };
    }
    return this.pagePermissionRepo.getPagePermissionsPaginated(
      access.id,
      pagination,
    );
  }

  async restrict(page: Page, user: User) {
    if (await this.pagePermissionRepo.findPageAccessByPageId(page.id)) {
      throw new BadRequestException('This page is already restricted');
    }

    await executeTx(this.db, async (trx) => {
      const access = await this.pagePermissionRepo.insertPageAccess(
        {
          pageId: page.id,
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          accessLevel: PageAccessLevel.RESTRICTED,
          creatorId: user.id,
        },
        trx,
      );
      // whoever restricts keeps access, so the page is never orphaned
      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId: access.id,
            userId: user.id,
            role: PagePermissionRole.WRITER,
            addedById: user.id,
          },
        ],
        trx,
      );
    });

    this.audit(AuditEvent.PAGE_RESTRICTED, page);
    await this.afterChange(page);
  }

  async unrestrict(page: Page) {
    const access = await this.requireAccess(page);
    await this.pagePermissionRepo.deletePageAccess(access.pageId);

    this.audit(AuditEvent.PAGE_RESTRICTION_REMOVED, page);
    await this.afterChange(page);
  }

  async addPermissions(dto: AddPagePermissionDto, page: Page, user: User) {
    const access = await this.requireAccess(page);
    const [userIds, groupIds] = await Promise.all([
      this.workspaceUserIds(dto.userIds ?? [], page.workspaceId),
      this.workspaceGroupIds(dto.groupIds ?? [], page.workspaceId),
    ]);
    if (userIds.length === 0 && groupIds.length === 0) {
      throw new BadRequestException('Select at least one user or group');
    }

    const rows = [
      ...userIds.map((userId) => ({ userId, groupId: null })),
      ...groupIds.map((groupId) => ({ userId: null, groupId })),
    ].map((target) => ({
      pageAccessId: access.id,
      ...target,
      role: dto.role,
      addedById: user.id,
    }));

    // existing entries keep their role; change it with update-role
    await this.db
      .insertInto('pagePermissions')
      .values(rows)
      .onConflict((oc) => oc.doNothing())
      .execute();

    this.audit(AuditEvent.PAGE_PERMISSION_ADDED, page, {
      role: dto.role,
      userIds,
      groupIds,
    });
    await this.afterChange(page);
  }

  async removePermissions(dto: RemovePagePermissionDto, page: Page) {
    const access = await this.requireAccess(page);
    const userIds = dto.userIds ?? [];
    const groupIds = dto.groupIds ?? [];
    if (userIds.length === 0 && groupIds.length === 0) {
      throw new BadRequestException('Select at least one user or group');
    }

    await executeTx(this.db, async (trx) => {
      await this.pagePermissionRepo.deletePagePermissionsByUserIds(
        access.id,
        userIds,
        trx,
      );
      await this.pagePermissionRepo.deletePagePermissionsByGroupIds(
        access.id,
        groupIds,
        trx,
      );
      const writers = await this.pagePermissionRepo.countWritersByPageAccessId(
        access.id,
        { trx },
      );
      // rolls the removal back
      if (writers === 0) throw new BadRequestException(LAST_WRITER);
    });

    this.audit(AuditEvent.PAGE_PERMISSION_REMOVED, page, { userIds, groupIds });
    await this.afterChange(page);
  }

  async updateRole(dto: UpdatePagePermissionRoleDto, page: Page) {
    if (!dto.userId === !dto.groupId) {
      throw new BadRequestException('Provide either a userId or a groupId');
    }
    const access = await this.requireAccess(page);

    await executeTx(this.db, async (trx) => {
      await this.pagePermissionRepo.updatePagePermissionRole(
        access.id,
        dto.role,
        { userId: dto.userId, groupId: dto.groupId },
        trx,
      );
      const writers = await this.pagePermissionRepo.countWritersByPageAccessId(
        access.id,
        { trx },
      );
      if (writers === 0) throw new BadRequestException(LAST_WRITER);
    });

    this.audit(AuditEvent.PAGE_PERMISSION_ROLE_CHANGED, page, {
      role: dto.role,
      userId: dto.userId,
      groupId: dto.groupId,
    });
    await this.afterChange(page);
  }

  private async requireAccess(page: Page) {
    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!access) throw new BadRequestException('This page is not restricted');
    return access;
  }

  private async workspaceUserIds(ids: string[], workspaceId: string) {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('users')
      .select('id')
      .where('id', 'in', ids)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
    return rows.map((r) => r.id);
  }

  private async workspaceGroupIds(ids: string[], workspaceId: string) {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('groups')
      .select('id')
      .where('id', 'in', ids)
      .where('workspaceId', '=', workspaceId)
      .execute();
    return rows.map((r) => r.id);
  }

  // Drop cached restriction state and disconnect anyone who lost access.
  private async afterChange(page: Page) {
    await this.wsService.invalidateSpaceRestrictionCache(page.spaceId);
    await this.collabAccessService.recheckAccess({ pageIds: [page.id] });
    await this.wsService.removeBaseSubscribersWithoutAccess([page.id]);
  }

  private audit(
    event: AuditEventType,
    page: Page,
    metadata: Record<string, unknown> = {},
  ) {
    this.auditService.log({
      event,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { pageId: page.id, ...metadata },
    });
  }
}
