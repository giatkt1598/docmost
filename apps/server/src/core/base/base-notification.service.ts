import { Injectable, Logger } from '@nestjs/common';
import { BaseProperty, BaseRow, Page } from '@docmost/db/types/entity.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.constants';

const asIds = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v == null ? [] : [v]).filter(
    (x): x is string => typeof x === 'string',
  );

// Tells people when they are put in a person cell of a row.
@Injectable()
export class BaseNotificationService {
  private readonly logger = new Logger(BaseNotificationService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  // Fire and forget: a failed notification must not fail the row write.
  notifyAssigned(
    page: Page,
    row: BaseRow,
    properties: BaseProperty[],
    before: Record<string, unknown> | null,
    actorId: string,
  ): void {
    this.send(page, row, properties, before, actorId).catch((err) =>
      this.logger.warn(`Assignment notification failed: ${err?.message}`),
    );
  }

  // The people added to each person cell, by user, with the property name.
  static newAssignees(
    row: BaseRow,
    properties: BaseProperty[],
    before: Record<string, unknown> | null,
    actorId: string,
  ): Map<string, string> {
    const after = row.cells as Record<string, unknown>;
    const out = new Map<string, string>();
    for (const p of properties) {
      if (p.type !== 'person') continue;
      const old = new Set(asIds(before?.[p.id]));
      for (const id of asIds(after[p.id])) {
        if (id !== actorId && !old.has(id) && !out.has(id)) out.set(id, p.name);
      }
    }
    return out;
  }

  private async send(
    page: Page,
    row: BaseRow,
    properties: BaseProperty[],
    before: Record<string, unknown> | null,
    actorId: string,
  ) {
    const assignees = BaseNotificationService.newAssignees(
      row,
      properties,
      before,
      actorId,
    );
    if (assignees.size === 0) return;

    const inSpace = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
      [...assignees.keys()],
      page.spaceId,
    );
    const allowed = await this.pagePermissionRepo.getUserIdsWithPageAccess(
      page.id,
      [...inSpace],
    );
    if (allowed.length === 0) return;

    const primary = properties.find((p) => p.isPrimary);
    const title = primary
      ? (row.cells as Record<string, unknown>)[primary.id]
      : null;
    for (const userId of allowed) {
      await this.notificationService.create({
        userId,
        workspaceId: page.workspaceId,
        type: NotificationType.BASE_ROW_ASSIGNED,
        actorId,
        pageId: page.id,
        spaceId: page.spaceId,
        data: {
          rowId: row.id,
          rowTitle: typeof title === 'string' ? title.slice(0, 200) : null,
          propertyName: assignees.get(userId),
        },
      });
    }
  }
}
