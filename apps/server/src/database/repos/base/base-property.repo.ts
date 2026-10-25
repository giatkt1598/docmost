import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  BaseProperty,
  InsertableBaseProperty,
  UpdatableBaseProperty,
} from '@docmost/db/types/entity.types';
import { sql } from 'kysely';

@Injectable()
export class BasePropertyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByPageId(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<BaseProperty[]> {
    return dbOrTx(this.db, trx)
      .selectFrom('baseProperties')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .orderBy(sql`position collate "C"`, 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async findById(
    pageId: string,
    propertyId: string,
    trx?: KyselyTransaction,
  ): Promise<BaseProperty | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('baseProperties')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('id', '=', propertyId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async lastPosition(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<string | null> {
    const row = await dbOrTx(this.db, trx)
      .selectFrom('baseProperties')
      .select('position')
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .orderBy(sql`position collate "C"`, 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.position ?? null;
  }

  async insert(
    insertable: InsertableBaseProperty,
    trx?: KyselyTransaction,
  ): Promise<BaseProperty> {
    return dbOrTx(this.db, trx)
      .insertInto('baseProperties')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async insertMany(
    insertables: InsertableBaseProperty[],
    trx?: KyselyTransaction,
  ): Promise<BaseProperty[]> {
    if (insertables.length === 0) return [];
    return dbOrTx(this.db, trx)
      .insertInto('baseProperties')
      .values(insertables)
      .returningAll()
      .execute();
  }

  async update(
    pageId: string,
    propertyId: string,
    updatable: UpdatableBaseProperty,
    trx?: KyselyTransaction,
  ): Promise<BaseProperty | undefined> {
    return dbOrTx(this.db, trx)
      .updateTable('baseProperties')
      .set({ ...updatable, updatedAt: new Date() })
      .where('pageId', '=', pageId)
      .where('id', '=', propertyId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  // Applies the staged type of a background conversion, but only while the
  // staging token still matches (a newer re-stage invalidates this job).
  async commitPendingConversion(
    pageId: string,
    propertyId: string,
    pendingToken: string,
    trx?: KyselyTransaction,
  ): Promise<BaseProperty | undefined> {
    return dbOrTx(this.db, trx)
      .updateTable('baseProperties')
      .set({
        type: sql<string>`pending_type`,
        typeOptions: sql`pending_type_options`,
        pendingType: null,
        pendingTypeOptions: null,
        pendingToken: null,
        schemaVersion: sql<number>`schema_version + 1`,
        updatedAt: new Date(),
      })
      .where('pageId', '=', pageId)
      .where('id', '=', propertyId)
      .where('pendingToken', '=', pendingToken)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async clearPendingConversion(
    pageId: string,
    propertyId: string,
    pendingToken: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .updateTable('baseProperties')
      .set({
        pendingType: null,
        pendingTypeOptions: null,
        pendingToken: null,
        updatedAt: new Date(),
      })
      .where('pageId', '=', pageId)
      .where('id', '=', propertyId)
      .where('pendingToken', '=', pendingToken)
      .execute();
  }

  async softDelete(
    pageId: string,
    propertyId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .updateTable('baseProperties')
      .set({ deletedAt: new Date() })
      .where('pageId', '=', pageId)
      .where('id', '=', propertyId)
      .where('deletedAt', 'is', null)
      .execute();
  }


  async getSchemaVersion(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const row = await dbOrTx(this.db, trx)
      .selectFrom('pages')
      .select('baseSchemaVersion')
      .where('id', '=', pageId)
      .executeTakeFirst();
    return row?.baseSchemaVersion ?? 0;
  }
  // Returns the new schema version of the base.
  async bumpSchemaVersion(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const row = await dbOrTx(this.db, trx)
      .updateTable('pages')
      .set({ baseSchemaVersion: sql<number>`base_schema_version + 1` })
      .where('id', '=', pageId)
      .returning('baseSchemaVersion')
      .executeTakeFirst();
    return row?.baseSchemaVersion ?? 0;
  }
}
