import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  AiChat,
  AiChatMessage,
  InsertableAiChatMessage,
} from '@docmost/db/types/entity.types';

const MESSAGE_FIELDS = [
  'id',
  'chatId',
  'workspaceId',
  'userId',
  'role',
  'content',
  'toolCalls',
  'metadata',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const;

// Chats belong to the user who started them; every query is scoped to the
// creator and the workspace.
@Injectable()
export class AiChatRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async listChats(
    creatorId: string,
    workspaceId: string,
    opts: { query?: string; limit?: number } = {},
  ): Promise<AiChat[]> {
    return this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('creatorId', '=', creatorId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .$if(!!opts.query?.trim(), (qb) =>
        qb.where(
          sql`f_unaccent(title)`,
          'ilike',
          sql`f_unaccent(${'%' + opts.query.trim() + '%'})`,
        ),
      )
      .orderBy('updatedAt', 'desc')
      .limit(opts.limit ?? 100)
      .execute();
  }

  async findChat(
    chatId: string,
    creatorId: string,
    workspaceId: string,
  ): Promise<AiChat | undefined> {
    return this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('id', '=', chatId)
      .where('creatorId', '=', creatorId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async createChat(
    creatorId: string,
    workspaceId: string,
    title: string,
  ): Promise<AiChat> {
    return this.db
      .insertInto('aiChats')
      .values({ creatorId, workspaceId, title })
      .returningAll()
      .executeTakeFirst();
  }

  async updateChat(
    chatId: string,
    workspaceId: string,
    values: { title?: string } = {},
  ): Promise<AiChat | undefined> {
    return this.db
      .updateTable('aiChats')
      .set({ ...values, updatedAt: new Date() })
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirst();
  }

  async softDeleteChat(chatId: string, workspaceId: string): Promise<void> {
    const now = new Date();
    await this.db
      .updateTable('aiChats')
      .set({ deletedAt: now })
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .execute();
    await this.db
      .updateTable('aiChatMessages')
      .set({ deletedAt: now })
      .where('chatId', '=', chatId)
      .execute();
  }

  async listMessages(
    chatId: string,
    opts: { last?: number } = {},
  ): Promise<AiChatMessage[]> {
    const rows = await this.db
      .selectFrom('aiChatMessages')
      .select(MESSAGE_FIELDS)
      .where('chatId', '=', chatId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', opts.last ? 'desc' : 'asc')
      .$if(!!opts.last, (qb) => qb.limit(opts.last))
      .execute();
    return opts.last ? rows.reverse() : rows;
  }

  async insertMessage(
    message: InsertableAiChatMessage,
  ): Promise<AiChatMessage> {
    return this.db
      .insertInto('aiChatMessages')
      .values(message)
      .returning(MESSAGE_FIELDS)
      .executeTakeFirst();
  }
}
