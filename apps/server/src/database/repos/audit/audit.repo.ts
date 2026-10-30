import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { InsertableAudit } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';

export type AuditLogFilters = {
  event?: string;
  resourceType?: string;
  actorId?: string;
  spaceId?: string;
  startDate?: Date;
  endDate?: Date;
};

@Injectable()
export class AuditRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insertMany(rows: InsertableAudit[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insertInto('audit').values(rows).execute();
  }

  async findPage(
    workspaceId: string,
    filters: AuditLogFilters,
    pagination: PaginationOptions,
  ) {
    const query = this.db
      .selectFrom('audit')
      .select([
        'audit.id',
        'audit.workspaceId',
        'audit.actorId',
        'audit.actorType',
        'audit.event',
        'audit.resourceType',
        'audit.resourceId',
        'audit.spaceId',
        'audit.changes',
        'audit.metadata',
        'audit.ipAddress',
        'audit.userAgent',
        'audit.occurredAt',
        'audit.createdAt',
      ])
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select([
              'users.id',
              'users.name',
              'users.email',
              'users.avatarUrl',
            ])
            .whereRef('users.id', '=', 'audit.actorId'),
        ).as('actor'),
      )
      .where('audit.workspaceId', '=', workspaceId)
      .$if(!!filters.event, (qb) => qb.where('audit.event', '=', filters.event))
      .$if(!!filters.resourceType, (qb) =>
        qb.where('audit.resourceType', '=', filters.resourceType),
      )
      .$if(!!filters.actorId, (qb) =>
        qb.where('audit.actorId', '=', filters.actorId),
      )
      .$if(!!filters.spaceId, (qb) =>
        qb.where('audit.spaceId', '=', filters.spaceId),
      )
      .$if(!!filters.startDate, (qb) =>
        qb.where('audit.createdAt', '>=', filters.startDate),
      )
      .$if(!!filters.endDate, (qb) =>
        qb.where('audit.createdAt', '<=', filters.endDate),
      );

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'audit.id', direction: 'desc', key: 'id' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  // Names to show next to log rows, batched per resource type.
  async findResourceNames(
    workspaceId: string,
    ids: { page: string[]; space: string[]; group: string[]; user: string[] },
  ) {
    const [page, space, group, user] = await Promise.all([
      ids.page.length
        ? this.db
            .selectFrom('pages')
            .select(['id', 'title as name', 'slugId'])
            .where('workspaceId', '=', workspaceId)
            .where('id', 'in', ids.page)
            .execute()
        : [],
      ids.space.length
        ? this.db
            .selectFrom('spaces')
            .select(['id', 'name', 'slug'])
            .where('workspaceId', '=', workspaceId)
            .where('id', 'in', ids.space)
            .execute()
        : [],
      ids.group.length
        ? this.db
            .selectFrom('groups')
            .select(['id', 'name'])
            .where('workspaceId', '=', workspaceId)
            .where('id', 'in', ids.group)
            .execute()
        : [],
      ids.user.length
        ? this.db
            .selectFrom('users')
            .select(['id', 'name'])
            .where('workspaceId', '=', workspaceId)
            .where('id', 'in', ids.user)
            .execute()
        : [],
    ]);

    return [...page, ...space, ...group, ...user] as Array<{
      id: string;
      name: string | null;
      slug?: string;
      slugId?: string;
    }>;
  }

  async getRetentionDays(workspaceId: string): Promise<number | null> {
    const row = await this.db
      .selectFrom('workspaces')
      .select('auditRetentionDays')
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    return row?.auditRetentionDays ?? null;
  }

  async setRetentionDays(
    workspaceId: string,
    retentionDays: number,
  ): Promise<void> {
    await this.db
      .updateTable('workspaces')
      .set({ auditRetentionDays: retentionDays })
      .where('id', '=', workspaceId)
      .execute();
  }

  async listWorkspaceRetention() {
    return this.db
      .selectFrom('workspaces')
      .select(['id', 'auditRetentionDays'])
      .where('deletedAt', 'is', null)
      .execute();
  }

  // Returns how many rows went, so callers can loop until a batch comes up short.
  async deleteOlderThan(
    workspaceId: string,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    const result = await this.db
      .deleteFrom('audit')
      .where(
        'id',
        'in',
        this.db
          .selectFrom('audit')
          .select('id')
          .where('workspaceId', '=', workspaceId)
          .where('createdAt', '<', cutoff)
          .limit(batchSize),
      )
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
