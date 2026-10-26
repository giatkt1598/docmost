import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { Client } from 'typesense';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';

export const TYPESENSE_COLLECTION = 'docmost_pages';
// Typesense folds accents and splits words well for Latin scripts without a
// locale (Vietnamese included; setting 'vi' makes it worse). A locale only
// helps scripts that need their own tokenizer.
const SPECIAL_LOCALES = ['ja', 'zh', 'ko', 'th', 'el', 'ru', 'sr', 'uk', 'be'];
const MAX_CONTENT_CHARS = 100_000;
const IMPORT_BATCH = 200;
// markers that cannot occur in page text; swapped for <b> after escaping
const MARK_START = '⟦';
const MARK_END = '⟧';

export type TypesenseHit = { id: string; highlight: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Typesense highlight (with our markers) to the <b>-tagged HTML the client
// renders; everything else in the snippet is escaped.
export function toHighlightHtml(snippet: string): string {
  return escapeHtml(snippet)
    .split(MARK_START)
    .join('<b>')
    .split(MARK_END)
    .join('</b>');
}

// Keyword search through Typesense: an external index of the pages for typo
// tolerance and speed. Postgres remains the source of truth, the index only
// proposes ids and Postgres decides who may read them.
@Injectable()
export class TypesenseService implements OnModuleInit {
  private readonly logger = new Logger(TypesenseService.name);
  private client: Client | null = null;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
  ) {}

  isEnabled(): boolean {
    return this.environmentService.getSearchDriver() === 'typesense';
  }

  async onModuleInit() {
    if (!this.isEnabled()) return;
    // never block startup on the search service
    void this.prepare().catch((err) =>
      this.logger.error(`Typesense setup failed: ${err.message}`),
    );
  }

  private getClient(): Client {
    if (!this.client) {
      const url = new URL(this.environmentService.getTypesenseUrl());
      this.client = new Client({
        nodes: [
          {
            host: url.hostname,
            port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
            protocol: url.protocol.replace(':', ''),
          },
        ],
        apiKey: this.environmentService.getTypesenseApiKey(),
        connectionTimeoutSeconds: 5,
      });
    }
    return this.client;
  }

  // Creates the collection and loads the pages when it is new or empty.
  private async prepare() {
    const client = this.getClient();
    const locale = this.environmentService.getTypesenseLocale();
    const localized = SPECIAL_LOCALES.includes(locale) ? { locale } : {};

    let documents = 0;
    try {
      const existing = await client
        .collections(TYPESENSE_COLLECTION)
        .retrieve();
      documents = existing.num_documents ?? 0;
    } catch {
      await client.collections().create({
        name: TYPESENSE_COLLECTION,
        fields: [
          { name: 'workspace_id', type: 'string', facet: true },
          { name: 'space_id', type: 'string', facet: true },
          { name: 'title', type: 'string', ...localized },
          {
            name: 'text_content',
            type: 'string',
            optional: true,
            ...localized,
          },
          { name: 'creator_id', type: 'string', optional: true },
          { name: 'label_ids', type: 'string[]', optional: true },
          { name: 'updated_at', type: 'int64' },
        ],
        default_sorting_field: 'updated_at',
      } as any);
      this.logger.log('Created the Typesense pages collection');
    }

    if (documents === 0) await this.syncAll();
  }

  private async toDocuments(pageIds?: string[]) {
    const rows = await this.db
      .selectFrom('pages')
      .select([
        'id',
        'workspaceId',
        'spaceId',
        'title',
        'creatorId',
        'updatedAt',
        sql<string>`substring(coalesce(text_content, ''), 1, ${sql.raw(String(MAX_CONTENT_CHARS))})`.as(
          'text',
        ),
        sql<
          string[]
        >`coalesce((select array_agg(label_id::text) from page_labels where page_id = pages.id), '{}')`.as(
          'labelIds',
        ),
      ])
      .where('deletedAt', 'is', null)
      .$if(!!pageIds, (qb) => qb.where('id', 'in', pageIds))
      .execute();
    return rows.map((r) => ({
      id: r.id,
      workspace_id: r.workspaceId,
      space_id: r.spaceId,
      title: r.title ?? '',
      text_content: r.text,
      creator_id: r.creatorId ?? '',
      label_ids: r.labelIds ?? [],
      updated_at: new Date(r.updatedAt).getTime(),
    }));
  }

  // Loads every page; used for the first fill and for manual rebuilds.
  async syncAll() {
    this.logger.log('Indexing pages in Typesense');
    let cursor: string | null = null;
    let total = 0;
    for (;;) {
      const after = cursor;
      const ids = await this.db
        .selectFrom('pages')
        .select('id')
        .where('deletedAt', 'is', null)
        .$if(!!after, (qb) => qb.where('id', '>', after))
        .orderBy('id')
        .limit(IMPORT_BATCH)
        .execute();
      if (ids.length === 0) break;
      const docs = await this.toDocuments(ids.map((i) => i.id));
      await this.getClient()
        .collections(TYPESENSE_COLLECTION)
        .documents()
        .import(docs, { action: 'upsert' });
      total += docs.length;
      cursor = ids[ids.length - 1].id;
    }
    this.logger.log(`Indexed ${total} pages in Typesense`);
  }

  async upsertPages(pageIds: string[]) {
    if (pageIds.length === 0) return;
    const docs = await this.toDocuments(pageIds);
    const found = new Set(docs.map((d) => d.id));
    if (docs.length > 0) {
      await this.getClient()
        .collections(TYPESENSE_COLLECTION)
        .documents()
        .import(docs, { action: 'upsert' });
    }
    // pages that were deleted in the meantime
    await this.deletePages(pageIds.filter((id) => !found.has(id)));
  }

  async deletePages(pageIds: string[]) {
    if (pageIds.length === 0) return;
    await this.deleteWhere(`id:[${pageIds.join(',')}]`);
  }

  async deleteSpace(spaceId: string) {
    await this.deleteWhere(`space_id:=${spaceId}`);
  }

  async deleteWorkspace(workspaceId: string) {
    await this.deleteWhere(`workspace_id:=${workspaceId}`);
  }

  private async deleteWhere(filter: string) {
    await this.getClient()
      .collections(TYPESENSE_COLLECTION)
      .documents()
      .delete({ filter_by: filter });
  }

  // Ids of the best matches, best first, with a highlighted snippet.
  async search(opts: {
    query: string;
    workspaceId: string;
    spaceIds: string[];
    creatorId?: string;
    labelIds?: string[];
    limit: number;
  }): Promise<TypesenseHit[]> {
    if (opts.spaceIds.length === 0) return [];
    const filters = [
      `workspace_id:=${opts.workspaceId}`,
      `space_id:=[${opts.spaceIds.join(',')}]`,
    ];
    if (opts.creatorId) filters.push(`creator_id:=${opts.creatorId}`);
    if (opts.labelIds?.length) {
      filters.push(`label_ids:=[${opts.labelIds.join(',')}]`);
    }

    const result: any = await this.getClient()
      .collections(TYPESENSE_COLLECTION)
      .documents()
      .search({
        q: opts.query,
        query_by: 'title,text_content',
        query_by_weights: '3,1',
        filter_by: filters.join(' && '),
        prefix: true,
        num_typos: 2,
        per_page: Math.min(opts.limit, 250),
        highlight_start_tag: MARK_START,
        highlight_end_tag: MARK_END,
        highlight_affix_num_tokens: 6,
        snippet_threshold: 30,
        sort_by: '_text_match:desc,updated_at:desc',
      } as any);

    return (result.hits ?? []).map((hit: any) => {
      const content = (hit.highlights ?? []).find(
        (h: any) => h.field === 'text_content',
      );
      return {
        id: hit.document.id as string,
        highlight: content?.snippet ? toHighlightHtml(content.snippet) : '',
      };
    });
  }
}
