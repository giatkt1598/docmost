import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // When the event happened; created_at is when the row was written, which is
  // what SIEM cursors advance on and must stay monotonic with the insert.
  await db.schema
    .alterTable('audit')
    .addColumn('occurred_at', 'timestamptz')
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_workspace_event
    ON audit (workspace_id, event, id DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_workspace_actor
    ON audit (workspace_id, actor_id, id DESC)
    WHERE actor_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_workspace_created
    ON audit (workspace_id, created_at, id)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_audit_workspace_created`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_audit_workspace_actor`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_audit_workspace_event`.execute(db);
  await db.schema.alterTable('audit').dropColumn('occurred_at').execute();
}
