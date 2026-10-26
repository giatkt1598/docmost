import { type Kysely } from 'kysely';

// The page a chat was started from, so a page can show its own chats.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('ai_chats')
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .execute();

  await db.schema
    .createIndex('idx_ai_chats_page')
    .on('ai_chats')
    .columns(['workspace_id', 'creator_id', 'page_id', 'updated_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_ai_chats_page').ifExists().execute();
  await db.schema.alterTable('ai_chats').dropColumn('page_id').execute();
}
