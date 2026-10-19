import { InsertableMcpToken, McpToken } from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
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

  async revoke(
    tokenId: string,
    userId: string,
    workspaceId: string,
  ): Promise<number> {
    const result = await this.db
      .updateTable('mcpTokens')
      .set({ revokedAt: new Date() })
      .where('id', '=', tokenId)
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
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
