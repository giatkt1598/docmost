import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { PagePassword } from '@docmost/db/types/entity.types';

@Injectable()
export class PagePasswordRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByPageId(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<PagePassword | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('pagePasswords')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  // The password version of each protected page among `pageIds`; pages
  // without a password are absent.
  async getVersions(
    pageIds: string[],
    trx?: KyselyTransaction,
  ): Promise<Map<string, number>> {
    const versions = new Map<string, number>();
    if (pageIds.length === 0) return versions;
    const rows = await dbOrTx(this.db, trx)
      .selectFrom('pagePasswords')
      .select(['pageId', 'version'])
      .where('pageId', 'in', pageIds)
      .execute();
    for (const row of rows) versions.set(row.pageId, row.version);
    return versions;
  }

  // Sets or replaces the password; a replacement bumps the version so
  // unlocks of the old password stop working. Returns the new version.
  async upsert(
    opts: {
      pageId: string;
      workspaceId: string;
      spaceId: string;
      passwordHash: string;
      userId: string;
    },
    trx?: KyselyTransaction,
  ): Promise<number> {
    const row = await dbOrTx(this.db, trx)
      .insertInto('pagePasswords')
      .values({
        pageId: opts.pageId,
        workspaceId: opts.workspaceId,
        spaceId: opts.spaceId,
        passwordHash: opts.passwordHash,
        creatorId: opts.userId,
        updatedById: opts.userId,
      })
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({
          passwordHash: opts.passwordHash,
          updatedById: opts.userId,
          updatedAt: new Date(),
          version: sql`page_passwords.version + 1`,
        }),
      )
      .returning('version')
      .executeTakeFirstOrThrow();
    return row.version;
  }

  async deleteByPageId(pageId: string, trx?: KyselyTransaction) {
    await dbOrTx(this.db, trx)
      .deleteFrom('pagePasswords')
      .where('pageId', '=', pageId)
      .execute();
  }

  // Gives copies of protected pages the same password, so duplicating a
  // page never strips its protection.
  async copyToPages(
    copies: { fromPageId: string; toPageId: string }[],
    target: { workspaceId: string; spaceId: string },
    userId: string,
    trx?: KyselyTransaction,
  ) {
    if (copies.length === 0) return;
    const db = dbOrTx(this.db, trx);
    const sources = await db
      .selectFrom('pagePasswords')
      .select(['pageId', 'passwordHash'])
      .where(
        'pageId',
        'in',
        copies.map((c) => c.fromPageId),
      )
      .execute();
    if (sources.length === 0) return;
    const hashByPage = new Map(sources.map((s) => [s.pageId, s.passwordHash]));
    const values = copies
      .filter((c) => hashByPage.has(c.fromPageId))
      .map((c) => ({
        pageId: c.toPageId,
        workspaceId: target.workspaceId,
        spaceId: target.spaceId,
        passwordHash: hashByPage.get(c.fromPageId),
        creatorId: userId,
        updatedById: userId,
      }));
    await db
      .insertInto('pagePasswords')
      .values(values)
      .onConflict((oc) => oc.column('pageId').doNothing())
      .execute();
  }
}
