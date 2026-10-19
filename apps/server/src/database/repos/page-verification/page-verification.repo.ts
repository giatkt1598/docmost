import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ExpressionBuilder, sql } from 'kysely';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { DB } from '@docmost/db/types/db';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertablePageVerification,
  PageVerification,
  UpdatablePageVerification,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';

export type VerifierRef = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type PageVerificationWithRelations = PageVerification & {
  verifiedBy: { id: string; name: string; avatarUrl: string | null } | null;
  verifiers: VerifierRef[];
};

@Injectable()
export class PageVerificationRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  withVerifiers(eb: ExpressionBuilder<DB, 'pageVerifications'>) {
    return jsonArrayFrom(
      eb
        .selectFrom('pageVerifiers')
        .innerJoin('users', 'users.id', 'pageVerifiers.userId')
        .select(['users.id', 'users.name', 'users.email', 'users.avatarUrl'])
        .whereRef(
          'pageVerifiers.pageVerificationId',
          '=',
          'pageVerifications.id',
        )
        .orderBy('pageVerifiers.isPrimary', 'desc')
        .orderBy('pageVerifiers.createdAt', 'asc'),
    ).as('verifiers');
  }

  withVerifiedBy(eb: ExpressionBuilder<DB, 'pageVerifications'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'pageVerifications.verifiedById'),
    ).as('verifiedBy');
  }

  async findByPageId(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<PageVerificationWithRelations | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('pageVerifications')
      .selectAll('pageVerifications')
      .select((eb) => [this.withVerifiers(eb), this.withVerifiedBy(eb)])
      .where('pageId', '=', pageId)
      .executeTakeFirst() as Promise<PageVerificationWithRelations | undefined>;
  }

  async insert(
    insertable: InsertablePageVerification,
    trx?: KyselyTransaction,
  ): Promise<PageVerification> {
    return dbOrTx(this.db, trx)
      .insertInto('pageVerifications')
      .values(insertable)
      .returningAll()
      .executeTakeFirst();
  }

  async update(
    verificationId: string,
    updatable: UpdatablePageVerification,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .updateTable('pageVerifications')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', verificationId)
      .execute();
  }

  async delete(verificationId: string, trx?: KyselyTransaction): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('pageVerifications')
      .where('id', '=', verificationId)
      .execute();
  }

  // first id becomes the primary verifier
  async replaceVerifiers(
    verificationId: string,
    userIds: string[],
    addedById: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('pageVerifiers')
      .where('pageVerificationId', '=', verificationId)
      .execute();

    if (userIds.length === 0) return;

    await db
      .insertInto('pageVerifiers')
      .values(
        userIds.map((userId, index) => ({
          pageVerificationId: verificationId,
          userId,
          isPrimary: index === 0,
          addedById,
        })),
      )
      .execute();
  }

  async getVerifierIds(verificationId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pageVerifiers')
      .select('userId')
      .where('pageVerificationId', '=', verificationId)
      .execute();
    return rows.map((r) => r.userId);
  }

  // Lets the next expiry cycle notify verifiers again.
  async deleteReminderNotifications(
    verificationId: string,
    types: string[],
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('notifications')
      .where('pageVerificationId', '=', verificationId)
      .where('type', 'in', types)
      .execute();
  }

  // Page-level restrictions are not applied here; callers must filter by page access.
  async list(opts: {
    workspaceId: string;
    spaceIds: string[];
    verifierId?: string;
    query?: string;
    pagination: PaginationOptions;
  }) {
    let query = this.db
      .selectFrom('pageVerifications')
      .innerJoin('pages', 'pages.id', 'pageVerifications.pageId')
      .innerJoin('spaces', 'spaces.id', 'pageVerifications.spaceId')
      .selectAll('pageVerifications')
      .select([
        'pages.title as pageTitle',
        'pages.slugId as pageSlugId',
        'pages.icon as pageIcon',
        'spaces.name as spaceName',
        'spaces.slug as spaceSlug',
      ])
      .select((eb) => [this.withVerifiers(eb), this.withVerifiedBy(eb)])
      .where('pageVerifications.workspaceId', '=', opts.workspaceId)
      .where('pageVerifications.type', '=', 'expiring')
      .where('pages.deletedAt', 'is', null);

    query =
      opts.spaceIds.length > 0
        ? query.where('pageVerifications.spaceId', 'in', opts.spaceIds)
        : query.where(sql<boolean>`false`);

    if (opts.verifierId) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('pageVerifiers')
            .select('pageVerifiers.id')
            .whereRef(
              'pageVerifiers.pageVerificationId',
              '=',
              'pageVerifications.id',
            )
            .where('pageVerifiers.userId', '=', opts.verifierId),
        ),
      );
    }

    if (opts.query) {
      query = query.where(
        sql`f_unaccent(pages.title)`,
        'ilike',
        sql`f_unaccent(${'%' + opts.query + '%'})`,
      );
    }

    return executeWithCursorPagination(query, {
      perPage: opts.pagination.limit,
      cursor: opts.pagination.cursor,
      beforeCursor: opts.pagination.beforeCursor,
      fields: [{ expression: 'pageVerifications.id', direction: 'desc' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  // Recurring verifications that expire before the given time (incl. already expired).
  async findExpiringBefore(before: Date): Promise<PageVerification[]> {
    return this.db
      .selectFrom('pageVerifications')
      .innerJoin('pages', 'pages.id', 'pageVerifications.pageId')
      .selectAll('pageVerifications')
      .where('pageVerifications.type', '=', 'expiring')
      .where('pageVerifications.expiresAt', 'is not', null)
      .where('pageVerifications.expiresAt', '<=', before)
      .where('pages.deletedAt', 'is', null)
      .execute();
  }
}
