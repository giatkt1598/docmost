import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export type UserMfaRow = {
  id: string;
  userId: string;
  workspaceId: string;
  method: string;
  secret: string | null;
  isEnabled: boolean | null;
  backupCodes: string[] | null;
};

@Injectable()
export class UserMfaRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByUser(
    userId: string,
    workspaceId: string,
  ): Promise<UserMfaRow | undefined> {
    return this.db
      .selectFrom('userMfa')
      .select([
        'id',
        'userId',
        'workspaceId',
        'method',
        'secret',
        'isEnabled',
        'backupCodes',
      ])
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  // One row per user: a new setup replaces any unfinished one.
  async upsertPending(opts: {
    userId: string;
    workspaceId: string;
    secret: string;
  }): Promise<void> {
    await this.db
      .deleteFrom('userMfa')
      .where('userId', '=', opts.userId)
      .where('workspaceId', '=', opts.workspaceId)
      .execute();
    await this.db
      .insertInto('userMfa')
      .values({
        userId: opts.userId,
        workspaceId: opts.workspaceId,
        method: 'totp',
        secret: opts.secret,
        isEnabled: false,
        backupCodes: [],
      })
      .execute();
  }

  async enable(id: string, backupCodes: string[]): Promise<void> {
    await this.db
      .updateTable('userMfa')
      .set({ isEnabled: true, backupCodes, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async setBackupCodes(id: string, backupCodes: string[]): Promise<void> {
    await this.db
      .updateTable('userMfa')
      .set({ backupCodes, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async delete(userId: string, workspaceId: string): Promise<void> {
    await this.db
      .deleteFrom('userMfa')
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}
