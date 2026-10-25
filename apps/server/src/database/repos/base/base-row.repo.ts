import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { BaseRow, InsertableBaseRow } from '@docmost/db/types/entity.types';
import { RawBuilder, sql } from 'kysely';

export type RowSort = { expr: RawBuilder<any>; direction: 'asc' | 'desc' };

export type RowListOptions = {
  pageId: string;
  limit: number;
  cursor?: string | null;
  filter?: RawBuilder<boolean> | null;
  sorts?: RowSort[];
};

export type RowListResult = {
  items: BaseRow[];
  hasNextPage: boolean;
  nextCursor: string | null;
};

const encodeCursor = (v: object) =>
  Buffer.from(JSON.stringify(v)).toString('base64url');

function decodeCursor(cursor?: string | null): any {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid cursor');
  }
}

@Injectable()
export class BaseRowRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    rowId: string,
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<BaseRow | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('baseRows')
      .selectAll()
      .where('id', '=', rowId)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByIds(
    rowIds: string[],
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<BaseRow[]> {
    if (rowIds.length === 0) return [];
    return dbOrTx(this.db, trx)
      .selectFrom('baseRows')
      .selectAll()
      .where('id', 'in', rowIds)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  // Rows in a stable id order, for background jobs that walk the whole base.
  async findBatch(
    pageId: string,
    afterId: string | null,
    limit: number,
    trx?: KyselyTransaction,
  ): Promise<BaseRow[]> {
    let q = dbOrTx(this.db, trx)
      .selectFrom('baseRows')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .orderBy('id', 'asc')
      .limit(limit);
    if (afterId) q = q.where('id', '>', afterId);
    return q.execute();
  }

  async list(opts: RowListOptions): Promise<RowListResult> {
    const sorts = opts.sorts ?? [];
    const cur = decodeCursor(opts.cursor);

    let q = this.db
      .selectFrom('baseRows')
      .selectAll()
      .where('pageId', '=', opts.pageId)
      .where('deletedAt', 'is', null);
    if (opts.filter) q = q.where(opts.filter);

    if (sorts.length === 0) {
      // keyset over (position, id), matching idx_base_rows_page_alive
      if (cur?.p != null) {
        q = q.where(
          sql<boolean>`(base_rows.position collate "C", base_rows.id) > (${cur.p}::text collate "C", ${cur.i}::uuid)`,
        );
      }
      q = q
        .orderBy(sql`base_rows.position collate "C"`, 'asc')
        .orderBy('id', 'asc');
    } else {
      // Sorted pages use an offset cursor: keyset over mixed directions and
      // nullable expressions is not worth the complexity here.
      for (const s of sorts) {
        q = q.orderBy(sql`${s.expr} ${sql.raw(s.direction)} nulls last`);
      }
      q = q
        .orderBy(sql`base_rows.position collate "C"`, 'asc')
        .orderBy('id', 'asc');
      if (cur?.o) q = q.offset(Number(cur.o));
    }

    const rows = await q.limit(opts.limit + 1).execute();
    const hasNextPage = rows.length > opts.limit;
    if (hasNextPage) rows.pop();

    let nextCursor: string | null = null;
    if (hasNextPage) {
      const last = rows[rows.length - 1];
      nextCursor =
        sorts.length === 0
          ? encodeCursor({ p: last.position, i: last.id })
          : encodeCursor({ o: Number(cur?.o ?? 0) + rows.length });
    }
    return { items: rows, hasNextPage, nextCursor };
  }

  // Every non-deleted row matching the filter, in batches (CSV export).
  async *iterate(
    pageId: string,
    filter: RawBuilder<boolean> | null,
    sorts: RowSort[],
    batchSize = 500,
  ): AsyncGenerator<BaseRow[]> {
    let cursor: string | null = null;
    while (true) {
      const page = await this.list({
        pageId,
        limit: batchSize,
        cursor,
        filter,
        sorts,
      });
      if (page.items.length) yield page.items;
      if (!page.hasNextPage) return;
      cursor = page.nextCursor;
    }
  }

  async insert(
    insertable: InsertableBaseRow,
    trx?: KyselyTransaction,
  ): Promise<BaseRow> {
    return dbOrTx(this.db, trx)
      .insertInto('baseRows')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async insertMany(
    insertables: InsertableBaseRow[],
    trx?: KyselyTransaction,
  ): Promise<BaseRow[]> {
    if (insertables.length === 0) return [];
    return dbOrTx(this.db, trx)
      .insertInto('baseRows')
      .values(insertables)
      .returningAll()
      .execute();
  }

  // Merges the patch into the row cells (null removes a key) and optionally
  // moves the row.
  async updateRow(
    rowId: string,
    pageId: string,
    update: {
      cellsPatch?: Record<string, unknown>;
      position?: string;
      userId?: string | null;
    },
    trx?: KyselyTransaction,
  ): Promise<BaseRow | undefined> {
    const set: Record<string, unknown> = {
      updatedAt: new Date(),
      lastUpdatedById: update.userId ?? null,
    };
    if (update.position) set.position = update.position;
    if (update.cellsPatch && Object.keys(update.cellsPatch).length > 0) {
      set.cells = sql`jsonb_set_many(cells, ${JSON.stringify(update.cellsPatch)}::text::jsonb)`;
    }
    return dbOrTx(this.db, trx)
      .updateTable('baseRows')
      .set(set as any)
      .where('id', '=', rowId)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  // Writes per-row cell patches in one statement. Used for computed values
  // (formulas, conversions), which do not count as a user edit.
  async applyPatches(
    pageId: string,
    patches: Array<{ id: string; patch: Record<string, unknown> }>,
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (patches.length === 0) return;
    await sql`
      update base_rows r
      set cells = jsonb_set_many(r.cells, x.patch)
      from jsonb_to_recordset(${JSON.stringify(patches)}::text::jsonb)
        as x(id uuid, patch jsonb)
      where r.id = x.id and r.page_id = ${pageId}::uuid
        and r.deleted_at is null
    `.execute(dbOrTx(this.db, trx));
  }

  async softDelete(
    rowId: string,
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    const res = await dbOrTx(this.db, trx)
      .updateTable('baseRows')
      .set({ deletedAt: new Date() })
      .where('id', '=', rowId)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(res.numUpdatedRows) > 0;
  }

  // Returns the ids that were actually deleted.
  async softDeleteMany(
    rowIds: string[],
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<string[]> {
    if (rowIds.length === 0) return [];
    const rows = await dbOrTx(this.db, trx)
      .updateTable('baseRows')
      .set({ deletedAt: new Date() })
      .where('id', 'in', rowIds)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .returning('id')
      .execute();
    return rows.map((r) => r.id);
  }

  async lastPosition(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<string | null> {
    const row = await dbOrTx(this.db, trx)
      .selectFrom('baseRows')
      .select('position')
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .orderBy(sql`position collate "C"`, 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.position ?? null;
  }

  // Position of the first row after the given position (null if none).
  async nextPosition(
    pageId: string,
    afterPosition: string,
    trx?: KyselyTransaction,
  ): Promise<string | null> {
    const row = await dbOrTx(this.db, trx)
      .selectFrom('baseRows')
      .select('position')
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .where(
        sql<boolean>`position collate "C" > ${afterPosition}::text collate "C"`,
      )
      .orderBy(sql`position collate "C"`, 'asc')
      .limit(1)
      .executeTakeFirst();
    return row?.position ?? null;
  }

  // Removes a deleted property from the cells of up to `limit` rows.
  async removeCellKey(
    pageId: string,
    propertyId: string,
    limit = 1000,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const res = await sql`
      update base_rows
      set cells = cells - ${propertyId}::text
      where id in (
        select id from base_rows
        where page_id = ${pageId}::uuid and cells ? ${propertyId}::text
        limit ${limit}
      )
    `.execute(dbOrTx(this.db, trx));
    return Number(res.numAffectedRows ?? 0);
  }

  async count(pageId: string, trx?: KyselyTransaction): Promise<number> {
    const r = await dbOrTx(this.db, trx)
      .selectFrom('baseRows')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(r?.count ?? 0);
  }

  // Duplicates all live rows of one base into another.
  async copyRows(
    fromPageId: string,
    toPageId: string,
    userId: string | null,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await sql`
      insert into base_rows
        (page_id, cells, position, creator_id, last_updated_by_id, workspace_id)
      select ${toPageId}::uuid, cells, position, ${userId}::uuid,
        ${userId}::uuid, workspace_id
      from base_rows
      where page_id = ${fromPageId}::uuid and deleted_at is null
    `.execute(dbOrTx(this.db, trx));
  }
}
