import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { toVectorLiteral } from '@docmost/db/helpers/vector-schema';

export type EmbeddingOwner =
  | { kind: 'page'; id: string }
  | { kind: 'attachment'; id: string };

export type EmbeddingRow = {
  workspaceId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  model: string;
  vector: number[];
};

// Embedded chunks of pages and attachments (pgvector). The table only exists
// when pgvector is installed; callers check that first.
@Injectable()
export class SearchEmbeddingRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private column(owner: EmbeddingOwner) {
    return owner.kind === 'page' ? 'pageId' : 'attachmentId';
  }

  async listChunks(owner: EmbeddingOwner) {
    return this.db
      .selectFrom('searchEmbeddings')
      .select(['chunkIndex', 'contentHash', 'model'])
      .where(this.column(owner), '=', owner.id)
      .execute();
  }

  async upsertChunks(owner: EmbeddingOwner, rows: EmbeddingRow[]) {
    if (rows.length === 0) return;
    const values = rows.map(
      (r) =>
        sql`(${r.workspaceId}, ${owner.id}, ${r.chunkIndex}, ${r.content}, ${r.contentHash}, ${r.model}, ${r.vector.length}, ${toVectorLiteral(r.vector)}::text::vector)`,
    );
    const ownerColumn = owner.kind === 'page' ? 'page_id' : 'attachment_id';
    await sql`
      INSERT INTO search_embeddings
        (workspace_id, ${sql.raw(ownerColumn)}, chunk_index, content, content_hash, model, dimensions, embedding)
      VALUES ${sql.join(values)}
      ON CONFLICT (${sql.raw(ownerColumn)}, chunk_index) WHERE ${sql.raw(ownerColumn)} IS NOT NULL
      DO UPDATE SET
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash,
        model = EXCLUDED.model,
        dimensions = EXCLUDED.dimensions,
        embedding = EXCLUDED.embedding
    `.execute(this.db);
  }

  // Removes chunks past the new end of the text and chunks of another model.
  async deleteStale(owner: EmbeddingOwner, chunkCount: number, model: string) {
    await this.db
      .deleteFrom('searchEmbeddings')
      .where(this.column(owner), '=', owner.id)
      .where((eb) =>
        eb.or([eb('chunkIndex', '>=', chunkCount), eb('model', '!=', model)]),
      )
      .execute();
  }

  async deleteForPages(pageIds: string[]) {
    if (pageIds.length === 0) return;
    await this.db
      .deleteFrom('searchEmbeddings')
      .where('pageId', 'in', pageIds)
      .execute();
  }

  async deleteForAttachments(attachmentIds: string[]) {
    if (attachmentIds.length === 0) return;
    await this.db
      .deleteFrom('searchEmbeddings')
      .where('attachmentId', 'in', attachmentIds)
      .execute();
  }

  async deleteForSpace(spaceId: string) {
    await this.db
      .deleteFrom('searchEmbeddings')
      .where((eb) =>
        eb.or([
          eb(
            'pageId',
            'in',
            this.db
              .selectFrom('pages')
              .select('id')
              .where('spaceId', '=', spaceId),
          ),
          eb(
            'attachmentId',
            'in',
            this.db
              .selectFrom('attachments')
              .select('id')
              .where('spaceId', '=', spaceId),
          ),
        ]),
      )
      .execute();
  }

  async deleteForWorkspace(workspaceId: string) {
    await this.db
      .deleteFrom('searchEmbeddings')
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async stats(workspaceId: string) {
    const { rows } = await sql<{
      pagesTotal: string;
      pagesIndexed: string;
      attachmentsTotal: string;
      attachmentsIndexed: string;
      model: string | null;
      dimensions: number | null;
    }>`
      SELECT
        (SELECT count(*) FROM pages WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL) AS "pagesTotal",
        (SELECT count(DISTINCT page_id) FROM search_embeddings WHERE workspace_id = ${workspaceId} AND page_id IS NOT NULL) AS "pagesIndexed",
        (SELECT count(*) FROM attachments WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND text_content IS NOT NULL) AS "attachmentsTotal",
        (SELECT count(DISTINCT attachment_id) FROM search_embeddings WHERE workspace_id = ${workspaceId} AND attachment_id IS NOT NULL) AS "attachmentsIndexed",
        (SELECT model FROM search_embeddings WHERE workspace_id = ${workspaceId} LIMIT 1) AS model,
        (SELECT dimensions FROM search_embeddings WHERE workspace_id = ${workspaceId} LIMIT 1) AS dimensions
    `.execute(this.db);
    const row = rows[0];
    return {
      pagesTotal: Number(row.pagesTotal),
      pagesIndexed: Number(row.pagesIndexed),
      attachmentsTotal: Number(row.attachmentsTotal),
      attachmentsIndexed: Number(row.attachmentsIndexed),
      model: row.model,
      dimensions: row.dimensions,
    };
  }
}
