import { type Kysely } from 'kysely';

// Providers without OAuth keep only an API token, in client_secret.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('integration_configs')
    .alterColumn('client_id', (col) => col.dropNotNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db
    .deleteFrom('integration_configs')
    .where('client_id', 'is', null)
    .execute();
  await db.schema
    .alterTable('integration_configs')
    .alterColumn('client_id', (col) => col.setNotNull())
    .execute();
}
