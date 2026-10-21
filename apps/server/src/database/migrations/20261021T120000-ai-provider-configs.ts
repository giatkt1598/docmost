import { type Kysely, sql } from 'kysely';

// The AI provider a workspace uses, configured from the settings UI.
// Kept out of workspaces.settings because that JSON is sent to every member.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('ai_provider_configs')
    .ifNotExists()
    .addColumn('workspace_id', 'uuid', (col) =>
      col.primaryKey().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('driver', 'text', (col) => col.notNull())
    .addColumn('base_url', 'text')
    // encrypted with the app secret
    .addColumn('api_key', 'text')
    .addColumn('completion_model', 'text', (col) => col.notNull())
    .addColumn('chat_model', 'text')
    .addColumn('updated_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('ai_provider_configs').ifExists().execute();
}
