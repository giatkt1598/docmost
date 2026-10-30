import { Kysely, sql } from 'kysely';

// Storage of search embeddings in pgvector. The vector column has no fixed
// size so workspaces can use any embedding model; each size gets its own
// partial HNSW index over a half-precision cast (up to 4000 dimensions).

export const EMBEDDINGS_TABLE = 'search_embeddings';

export async function isVectorSchemaReady(db: Kysely<any>): Promise<boolean> {
  const { rows } = await sql<{ ready: boolean }>`
    SELECT (to_regclass(${EMBEDDINGS_TABLE}) IS NOT NULL) AS ready
  `.execute(db);
  return rows[0]?.ready === true;
}

// Creates the extension and the table. Returns false when pgvector is not
// installed or the database user may not create the extension.
export async function ensureVectorSchema(db: Kysely<any>): Promise<boolean> {
  if (await isVectorSchemaReady(db)) return true;

  // Checked first: inside a migration a failed CREATE EXTENSION would abort the
  // whole transaction, and the catch below could not recover from that.
  const { rows } = await sql<{ available: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
    ) AS available
  `.execute(db);
  if (!rows[0]?.available) return false;

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);
  } catch {
    return false;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS search_embeddings (
      id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      page_id uuid REFERENCES pages(id) ON DELETE CASCADE,
      attachment_id uuid REFERENCES attachments(id) ON DELETE CASCADE,
      chunk_index integer NOT NULL,
      content text NOT NULL,
      content_hash text NOT NULL,
      model text NOT NULL,
      dimensions integer NOT NULL,
      embedding vector NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((page_id IS NULL) <> (attachment_id IS NULL))
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS search_embeddings_page_chunk_idx
      ON search_embeddings (page_id, chunk_index) WHERE page_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS search_embeddings_attachment_chunk_idx
      ON search_embeddings (attachment_id, chunk_index) WHERE attachment_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS search_embeddings_workspace_idx
      ON search_embeddings (workspace_id)
  `.execute(db);
  return true;
}

// The vector of a row as a half-precision value of the given size, null for
// rows of another size. Queries must use this exact expression to hit the
// index; the CASE keeps rows of other sizes from failing the cast.
export function halfvecExpression(dimensions: number) {
  const n = Math.trunc(dimensions);
  return sql.raw(
    `((CASE WHEN dimensions = ${n} THEN embedding::halfvec(${n}) END)::halfvec(${n}))`,
  );
}

export async function ensureVectorIndex(
  db: Kysely<any>,
  dimensions: number,
): Promise<void> {
  const n = Math.trunc(dimensions);
  if (!(n > 0 && n <= 4000)) {
    throw new Error(`Unsupported embedding size: ${dimensions}`);
  }
  await sql
    .raw(
      `CREATE INDEX IF NOT EXISTS search_embeddings_hnsw_${n}
         ON search_embeddings USING hnsw (((CASE WHEN dimensions = ${n} THEN embedding::halfvec(${n}) END)::halfvec(${n})) halfvec_cosine_ops)`,
    )
    .execute(db);
}

// A pgvector text literal such as '[0.1,0.2]'.
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
