import { Kysely } from 'kysely';

// A password can cover the sub-pages of its page too.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_passwords')
    .addColumn('include_sub_pages', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_passwords')
    .dropColumn('include_sub_pages')
    .execute();
}
