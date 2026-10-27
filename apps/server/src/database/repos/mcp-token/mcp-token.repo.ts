import { InsertableMcpToken, McpToken } from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { InjectKysely } from 'nestjs-kysely';

// tokenHash is deliberately left out so it never leaves the server
export type McpTokenListItem = Omit<McpToken, 'tokenHash'>;

@Injectable()
export class McpTokenRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private listFields: Array<keyof McpTokenListItem> = [
    'id',
    'name',
    'userId',
    'workspaceId',
    'lastUsedAt',
    'expiresAt',
    'revokedAt',
    'createdAt',
  ];

  async insert(
    insertable: InsertableMcpToken,
    trx?: KyselyTransaction,
  ): Promise<McpTokenListItem> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('mcpTokens')
      .values(insertable)
      .returning(this.listFields)
      .executeTakeFirst();
  }

  async findActiveByHash(tokenHash: string): Promise<McpToken | undefined> {
    return this.db
      .selectFrom('mcpTokens')
      .selectAll()
      .where('tokenHash', '=', tokenHash)
      .where('revokedAt', 'is', null)
      .where((eb) =>
        eb.or([eb('expiresAt', 'is', null), eb('expiresAt', '>', new Date())]),
      )
      .executeTakeFirst();
  }

  async listByUser(
    userId: string,
    workspaceId: string,
  ): Promise<McpTokenListItem[]> {
    return this.db
      .selectFrom('mcpTokens')
      .select(this.listFields)
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async findById(
    tokenId: string,
    workspaceId: string,
  ): Promise<McpTokenListItem | undefined> {
    return this.db
      .selectFrom('mcpTokens')
      .select(this.listFields)
      .where('id', '=', tokenId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
  }

  async countActiveByUser(
    userId: string,
    workspaceId: string,
  ): Promise<number> {
    const row = await this.db
      .selectFrom('mcpTokens')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .where((eb) =>
        eb.or([eb('expiresAt', 'is', null), eb('expiresAt', '>', new Date())]),
      )
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  // every active token of the workspace with its owner (admins only)
  async listByWorkspace(workspaceId: string, pagination: PaginationOptions) {
    const query = this.db
      .selectFrom('mcpTokens')
      .select([
        'mcpTokens.id',
        'mcpTokens.name',
        'mcpTokens.userId',
        'mcpTokens.workspaceId',
        'mcpTokens.lastUsedAt',
        'mcpTokens.expiresAt',
        'mcpTokens.revokedAt',
        'mcpTokens.createdAt',
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
            .whereRef('users.id', '=', 'mcpTokens.userId'),
        ).as('owner'),
      )
      .where('mcpTokens.workspaceId', '=', workspaceId)
      .where('mcpTokens.revokedAt', 'is', null);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'mcpTokens.id', direction: 'desc', key: 'id' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  // userId given: only that user's own token; null: any token (admins)
  async revoke(
    tokenId: string,
    userId: string | null,
    workspaceId: string,
  ): Promise<number> {
    const result = await this.db
      .updateTable('mcpTokens')
      .set({ revokedAt: new Date() })
      .where('id', '=', tokenId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .$if(userId !== null, (qb) => qb.where('userId', '=', userId))
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    await this.db
      .updateTable('mcpTokens')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', tokenId)
      .execute();
  }
}
