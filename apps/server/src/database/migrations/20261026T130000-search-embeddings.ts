import { type Kysely } from 'kysely';
import { ensureVectorSchema } from '../helpers/vector-schema';

// Embedding model of the AI provider, and the pgvector table that holds the
// embedded chunks of pages and attachments. Without pgvector the table is
// skipped and search stays keyword-only; it is created on demand once the
// extension is installed.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('ai_provider_configs')
    .addColumn('embedding_model', 'text')
    .addColumn('embedding_dimensions', 'integer')
    .execute();

  await ensureVectorSchema(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('search_embeddings').ifExists().execute();
  await db.schema
    .alterTable('ai_provider_configs')
    .dropColumn('embedding_model')
    .dropColumn('embedding_dimensions')
    .execute();
}
