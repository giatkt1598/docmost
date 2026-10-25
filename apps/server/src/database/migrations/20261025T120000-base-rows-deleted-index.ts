import { type Kysely, sql } from 'kysely';

// Lets the daily purge find soft-deleted rows without scanning every row.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS idx_base_rows_deleted_at
      ON base_rows (deleted_at)
      WHERE deleted_at IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_base_rows_deleted_at`.execute(db);
}
