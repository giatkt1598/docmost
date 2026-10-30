import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  InsertableSiemDestination,
  UpdatableSiemDestination,
} from '@docmost/db/types/entity.types';

export type SiemEvent = {
  id: string;
  timestamp: string;
  source: 'docmost';
  workspaceId: string;
  event: string;
  actor: {
    id: string | null;
    type: string;
    email: string | null;
  };
  resource: { type: string; id: string | null };
  spaceId: string | null;
  changes: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SiemCursor = { createdAt: Date; id: string };

@Injectable()
export class SiemDestinationRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  listByWorkspace(workspaceId: string) {
    return this.db
      .selectFrom('siemDestinations')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  findById(id: string, workspaceId?: string) {
    return this.db
      .selectFrom('siemDestinations')
      .selectAll()
      .where('id', '=', id)
      .$if(!!workspaceId, (qb) => qb.where('workspaceId', '=', workspaceId))
      .executeTakeFirst();
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    const row = await this.db
      .selectFrom('siemDestinations')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  insert(destination: InsertableSiemDestination) {
    return this.db
      .insertInto('siemDestinations')
      .values(destination)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // Bumping the version fences off any delivery already in progress.
  updateConfiguration(
    id: string,
    workspaceId: string,
    values: UpdatableSiemDestination,
  ) {
    return this.db
      .updateTable('siemDestinations')
      .set({
        ...values,
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirst();
  }

  async remove(id: string, workspaceId: string): Promise<void> {
    await this.db
      .deleteFrom('siemDestinations')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  findDue(now: Date) {
    return this.db
      .selectFrom('siemDestinations')
      .select(['id'])
      .where('enabled', '=', true)
      .where((eb) =>
        eb.or([
          eb('nextAttemptAt', 'is', null),
          eb('nextAttemptAt', '<=', now),
        ]),
      )
      .execute();
  }

  // Delivery state is only written by the version that read the destination.
  async updateDelivery(
    id: string,
    version: number,
    values: UpdatableSiemDestination,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('siemDestinations')
      .set(values)
      .where('id', '=', id)
      .where('version', '=', version)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async readEvents(
    workspaceId: string,
    cursor: SiemCursor,
    settledBefore: Date,
    limit: number,
  ): Promise<{ events: SiemEvent[]; last: SiemCursor | null }> {
    const rows = await this.db
      .selectFrom('audit')
      .leftJoin('users', 'users.id', 'audit.actorId')
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
        'users.email as actorEmail',
      ])
      .where('audit.workspaceId', '=', workspaceId)
      .where('audit.createdAt', '<', settledBefore)
      .where(
        sql<boolean>`(audit.created_at, audit.id) > (${cursor.createdAt}, ${cursor.id}::uuid)`,
      )
      .orderBy('audit.createdAt', 'asc')
      .orderBy('audit.id', 'asc')
      .limit(limit)
      .execute();

    const lastRow = rows[rows.length - 1];
    return {
      events: rows.map((row) => ({
        id: row.id,
        timestamp: new Date(row.occurredAt ?? row.createdAt).toISOString(),
        source: 'docmost',
        workspaceId: row.workspaceId,
        event: row.event,
        actor: {
          id: row.actorId,
          type: row.actorType,
          email: row.actorEmail ?? null,
        },
        resource: { type: row.resourceType, id: row.resourceId },
        spaceId: row.spaceId,
        changes: row.changes,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      })),
      last: lastRow
        ? { createdAt: new Date(lastRow.createdAt), id: lastRow.id }
        : null,
    };
  }

  async findOwnerIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('users')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('role', '=', 'owner')
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .execute();
    return rows.map((row) => row.id);
  }
}
