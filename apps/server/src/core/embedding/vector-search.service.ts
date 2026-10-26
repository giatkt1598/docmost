import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  halfvecExpression,
  toVectorLiteral,
} from '@docmost/db/helpers/vector-schema';
import { EmbeddingIndexService } from './embedding-index.service';

export type ChunkHit = {
  pageId: string | null;
  attachmentId: string | null;
  chunkIndex: number;
  content: string;
  distance: number;
};

// Nearest embedded chunks to a query (cosine distance).
@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);
  private iterativeScan: boolean | null = null;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly embeddings: EmbeddingIndexService,
  ) {}

  // pgvector 0.8 can keep scanning the index when filters discard rows
  private async supportsIterativeScan(): Promise<boolean> {
    if (this.iterativeScan === null) {
      const { rows } = await sql<{ version: string }>`
        SELECT extversion AS version FROM pg_extension WHERE extname = 'vector'
      `.execute(this.db);
      const [major, minor] = (rows[0]?.version ?? '0.0').split('.').map(Number);
      this.iterativeScan = major > 0 || minor >= 8;
    }
    return this.iterativeScan;
  }

  async search(
    workspaceId: string,
    text: string,
    limit = 40,
  ): Promise<ChunkHit[]> {
    const query = await this.embeddings.embedQuery(workspaceId, text);
    if (!query) return [];

    const expression = halfvecExpression(query.dimensions);
    const literal = toVectorLiteral(query.vector);
    const size = sql.raw(String(Math.trunc(query.dimensions)));
    const iterative = await this.supportsIterativeScan();

    const rows = await this.db.transaction().execute(async (trx) => {
      await sql`SET LOCAL hnsw.ef_search = 100`.execute(trx).catch(() => null);
      if (iterative) {
        await sql`SET LOCAL hnsw.iterative_scan = relaxed_order`.execute(trx);
      }
      const { rows } = await sql<{
        pageId: string | null;
        attachmentId: string | null;
        chunkIndex: number;
        content: string;
        distance: number;
      }>`
        SELECT page_id AS "pageId", attachment_id AS "attachmentId",
               chunk_index AS "chunkIndex", content,
               (${expression} <=> ${literal}::text::halfvec(${size})) AS distance
        FROM search_embeddings
        WHERE workspace_id = ${workspaceId}
          AND model = ${query.model}
          AND dimensions = ${query.dimensions}
        ORDER BY ${expression} <=> ${literal}::text::halfvec(${size})
        LIMIT ${limit}
      `.execute(trx);
      return rows;
    });

    return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
  }
}

// Keeps the chunks that are close to the best one: the closeness of a good
// match depends on the model, so the cutoff is relative.
export function relevantHits<T extends { distance: number }>(
  hits: T[],
  opts: { slack?: number; max?: number } = {},
): T[] {
  if (hits.length === 0) return [];
  const sorted = [...hits].sort((a, b) => a.distance - b.distance);
  const best = sorted[0].distance;
  const max = opts.max ?? 0.8;
  if (best > max) return [];
  return sorted.filter((h) => h.distance <= best + (opts.slack ?? 0.15));
}
