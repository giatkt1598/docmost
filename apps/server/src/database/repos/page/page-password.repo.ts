import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { PagePassword } from '@docmost/db/types/entity.types';

export type LockSource = {
  // the page holding the password
  pageId: string;
  version: number;
  includeSubPages: boolean;
  // held by an ancestor rather than the page itself
  inherited: boolean;
  title: string | null;
  icon: string | null;
};

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

  // What protects each of `pageIds`: its own password, and the passwords of
  // its ancestors that cover their sub-pages. Nearest first; pages with no
  // protection are absent.
  async getLockSources(
    pageIds: string[],
    trx?: KyselyTransaction,
  ): Promise<Map<string, LockSource[]>> {
    const sources = new Map<string, LockSource[]>();
    const ids = [...new Set(pageIds.filter(Boolean))];
    if (ids.length === 0) return sources;
    const db = dbOrTx(this.db, trx);
    // cheap exit: no password anywhere in these workspaces' trees
    const any = await db
      .selectFrom('pagePasswords')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (!any) return sources;

    const { rows } = await sql<{
      pageId: string;
      sourceId: string;
      version: number;
      includeSubPages: boolean;
      depth: number;
      title: string | null;
      icon: string | null;
    }>`
      with recursive chain as (
        select p.id as page_id, p.id as ancestor_id, p.parent_page_id, 0 as depth
        from pages p
        where p.id in (${sql.join(ids)})
        union all
        select c.page_id, p.id, p.parent_page_id, c.depth + 1
        from chain c
        join pages p on p.id = c.parent_page_id
        where c.depth < 100
      )
      select c.page_id as "pageId", pp.page_id as "sourceId", pp.version,
        pp.include_sub_pages as "includeSubPages", c.depth, sp.title, sp.icon
      from chain c
      join page_passwords pp on pp.page_id = c.ancestor_id
      join pages sp on sp.id = pp.page_id
      where c.depth = 0 or pp.include_sub_pages
      order by c.page_id, c.depth
    `.execute(db);

    for (const row of rows) {
      const list = sources.get(row.pageId) ?? [];
      list.push({
        pageId: row.sourceId,
        version: row.version,
        includeSubPages: row.includeSubPages,
        inherited: row.depth > 0,
        title: row.title,
        icon: row.icon,
      });
      sources.set(row.pageId, list);
    }
    return sources;
  }

  async setIncludeSubPages(
    pageId: string,
    includeSubPages: boolean,
    userId: string,
    trx?: KyselyTransaction,
  ) {
    await dbOrTx(this.db, trx)
      .updateTable('pagePasswords')
      .set({ includeSubPages, updatedById: userId, updatedAt: new Date() })
      .where('pageId', '=', pageId)
      .execute();
  }

  // Sets or replaces the password; a replacement bumps the version so
  // unlocks of the old password stop working. Returns the new version.
  async upsert(
    opts: {
      pageId: string;
      workspaceId: string;
      spaceId: string;
      passwordHash: string;
      includeSubPages: boolean;
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
        includeSubPages: opts.includeSubPages,
        creatorId: opts.userId,
        updatedById: opts.userId,
      })
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({
          passwordHash: opts.passwordHash,
          includeSubPages: opts.includeSubPages,
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
      .select(['pageId', 'passwordHash', 'includeSubPages'])
      .where(
        'pageId',
        'in',
        copies.map((c) => c.fromPageId),
      )
      .execute();
    if (sources.length === 0) return;
    const byPage = new Map(sources.map((s) => [s.pageId, s]));
    const values = copies
      .filter((c) => byPage.has(c.fromPageId))
      .map((c) => ({
        pageId: c.toPageId,
        workspaceId: target.workspaceId,
        spaceId: target.spaceId,
        passwordHash: byPage.get(c.fromPageId).passwordHash,
        includeSubPages: byPage.get(c.fromPageId).includeSubPages,
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
