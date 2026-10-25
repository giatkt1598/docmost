import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  BaseView,
  InsertableBaseView,
  UpdatableBaseView,
} from '@docmost/db/types/entity.types';
import { sql } from 'kysely';

@Injectable()
export class BaseViewRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByPageId(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<BaseView[]> {
    return dbOrTx(this.db, trx)
      .selectFrom('baseViews')
      .selectAll()
      .where('pageId', '=', pageId)
      .orderBy(sql`position collate "C"`, 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async findById(
    viewId: string,
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<BaseView | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('baseViews')
      .selectAll()
      .where('id', '=', viewId)
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  async lastPosition(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<string | null> {
    const row = await dbOrTx(this.db, trx)
      .selectFrom('baseViews')
      .select('position')
      .where('pageId', '=', pageId)
      .orderBy(sql`position collate "C"`, 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.position ?? null;
  }

  async insert(
    insertable: InsertableBaseView,
    trx?: KyselyTransaction,
  ): Promise<BaseView> {
    return dbOrTx(this.db, trx)
      .insertInto('baseViews')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async insertMany(
    insertables: InsertableBaseView[],
    trx?: KyselyTransaction,
  ): Promise<BaseView[]> {
    if (insertables.length === 0) return [];
    return dbOrTx(this.db, trx)
      .insertInto('baseViews')
      .values(insertables)
      .returningAll()
      .execute();
  }

  // `config` is merged key by key; a null value removes the key.
  async update(
    viewId: string,
    pageId: string,
    updatable: UpdatableBaseView,
    configPatch?: Record<string, unknown>,
    trx?: KyselyTransaction,
  ): Promise<BaseView | undefined> {
    let q = dbOrTx(this.db, trx)
      .updateTable('baseViews')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', viewId)
      .where('pageId', '=', pageId);
    if (configPatch && Object.keys(configPatch).length > 0) {
      q = q.set({
        config: sql`jsonb_set_many(config, ${JSON.stringify(configPatch)}::jsonb)`,
      });
    }
    return q.returningAll().executeTakeFirst();
  }

  async delete(
    viewId: string,
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('baseViews')
      .where('id', '=', viewId)
      .where('pageId', '=', pageId)
      .execute();
  }

  async countByPageId(pageId: string, trx?: KyselyTransaction): Promise<number> {
    const r = await dbOrTx(this.db, trx)
      .selectFrom('baseViews')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('pageId', '=', pageId)
      .executeTakeFirst();
    return Number(r?.count ?? 0);
  }
}
