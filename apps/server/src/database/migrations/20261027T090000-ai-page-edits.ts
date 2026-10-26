import { type Kysely, sql } from 'kysely';

// One row per AI edit of a page: what was asked, how to take it back, and
// the state the edited blocks were left in (so Undo can tell whether
// someone changed them since). History rows point at the edit.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('ai_page_edits')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('ai_chat_id', 'uuid', (col) =>
      col.references('ai_chats.id').onDelete('set null'),
    )
    .addColumn('summary', 'text')
    .addColumn('operations', 'jsonb', (col) => col.notNull())
    .addColumn('inverse', 'jsonb')
    .addColumn('affected', 'jsonb')
    // pending | applied | undone | failed
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('undo_of', 'uuid', (col) =>
      col.references('ai_page_edits.id').onDelete('set null'),
    )
    .addColumn('error', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_ai_page_edits_page')
    .on('ai_page_edits')
    .columns(['page_id', 'created_at'])
    .execute();

  await db.schema
    .alterTable('page_history')
    // user | ai | undo
    .addColumn('source', 'varchar', (col) => col.defaultTo('user'))
    .addColumn('ai_edit_id', 'uuid', (col) =>
      col.references('ai_page_edits.id').onDelete('set null'),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_history')
    .dropColumn('ai_edit_id')
    .dropColumn('source')
    .execute();
  await db.schema.dropTable('ai_page_edits').execute();
}
