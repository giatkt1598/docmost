import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  AuthProvider,
  InsertableAuthProvider,
  UpdatableAuthProvider,
} from '@docmost/db/types/entity.types';

@Injectable()
export class AuthProviderRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async list(workspaceId: string): Promise<AuthProvider[]> {
    return this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  async findById(
    providerId: string,
    workspaceId: string,
  ): Promise<AuthProvider | undefined> {
    return this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async insert(insertable: InsertableAuthProvider): Promise<AuthProvider> {
    return this.db
      .insertInto('authProviders')
      .values(insertable)
      .returningAll()
      .executeTakeFirst();
  }

  async update(
    providerId: string,
    workspaceId: string,
    updatable: UpdatableAuthProvider,
  ): Promise<void> {
    await this.db
      .updateTable('authProviders')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async softDelete(providerId: string, workspaceId: string): Promise<void> {
    await this.db
      .updateTable('authProviders')
      .set({ deletedAt: new Date(), isEnabled: false })
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async findAccount(providerId: string, providerUserId: string) {
    return this.db
      .selectFrom('authAccounts')
      .selectAll()
      .where('authProviderId', '=', providerId)
      .where('providerUserId', '=', providerUserId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async linkAccount(opts: {
    providerId: string;
    providerUserId: string;
    userId: string;
    workspaceId: string;
  }): Promise<void> {
    const existing = await this.findAccount(
      opts.providerId,
      opts.providerUserId,
    );
    if (existing) {
      if (existing.userId !== opts.userId) {
        await this.db
          .updateTable('authAccounts')
          .set({ userId: opts.userId, updatedAt: new Date() })
          .where('id', '=', existing.id)
          .execute();
      }
      return;
    }
    await this.db
      .insertInto('authAccounts')
      .values({
        authProviderId: opts.providerId,
        providerUserId: opts.providerUserId,
        userId: opts.userId,
        workspaceId: opts.workspaceId,
      })
      .execute();
  }
}
