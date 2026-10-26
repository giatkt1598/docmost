import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { EmbeddingIndexService } from '../embedding/embedding-index.service';
import {
  relevantHits,
  VectorSearchService,
} from '../embedding/vector-search.service';
import { SearchDTO } from './dto/search.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { SearchService } from './search.service';
import { escapeHtml, TypesenseService } from './typesense.service';
import { fuseRankings } from './rrf';

// pg-tsquery turns free text into a tsquery that never throws
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsquery = require('pg-tsquery')();

const SEMANTIC_TIMEOUT_MS = 4000;
const SNIPPET_CHARS = 220;

type Scope = { userId: string; workspaceId: string };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function snippet(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  const cut = flat.slice(0, SNIPPET_CHARS);
  return escapeHtml(flat.length > SNIPPET_CHARS ? `${cut}…` : cut);
}

// Search for members: the keyword engine (Postgres, or Typesense when
// configured) merged with a semantic match over embeddings when those exist.
// Whatever finds a page, Postgres decides who may see it.
@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly searchService: SearchService,
    private readonly typesense: TypesenseService,
    private readonly vectors: VectorSearchService,
    private readonly embeddings: EmbeddingIndexService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly environmentService: EnvironmentService,
  ) {}

  async capabilities(workspaceId: string) {
    return {
      driver: this.environmentService.getSearchDriver(),
      semantic: !!(await this.embeddings
        .context(workspaceId)
        .catch(() => null)),
      attachments: true,
    };
  }

  async searchPages(
    params: SearchDTO,
    scope: Scope,
  ): Promise<{ items: SearchResponseDto[] }> {
    const query = params.query?.trim() ?? '';
    const limit = params.limit || 25;
    const keyword = this.keywordPages(params, scope, query, limit);

    // filters-only browsing, title lookups and later pages stay keyword-only
    if (query.length < 3 || params.titleOnly || (params.offset ?? 0) > 0) {
      return keyword;
    }

    const semantic = withTimeout(
      this.semanticPages(params, scope, query, limit),
      SEMANTIC_TIMEOUT_MS,
    ).catch((err) => {
      this.logger.debug(`Semantic search skipped: ${err.message}`);
      return [] as SearchResponseDto[];
    });

    const [keywordResult, semanticItems] = await Promise.all([
      keyword,
      semantic,
    ]);
    if (semanticItems.length === 0) return keywordResult;

    const byId = new Map<string, SearchResponseDto>();
    for (const item of semanticItems) byId.set(item.id, item);
    // keyword results carry the better highlight, so they win
    for (const item of keywordResult.items) byId.set(item.id, item);

    const order = fuseRankings([
      keywordResult.items.map((i) => i.id),
      semanticItems.map((i) => i.id),
    ]);
    return {
      items: order.slice(0, limit).map((id) => byId.get(id)),
    };
  }

  private async keywordPages(
    params: SearchDTO,
    scope: Scope,
    query: string,
    limit: number,
  ): Promise<{ items: SearchResponseDto[] }> {
    if (
      this.typesense.isEnabled() &&
      query.length > 0 &&
      !params.titleOnly &&
      !(params.offset ?? 0)
    ) {
      try {
        return await this.typesensePages(params, scope, query, limit);
      } catch (err) {
        this.logger.warn(
          `Typesense search failed, using Postgres: ${(err as Error).message}`,
        );
      }
    }
    return this.searchService.searchPage(params, scope);
  }

  private async typesensePages(
    params: SearchDTO,
    scope: Scope,
    query: string,
    limit: number,
  ) {
    const spaceIds = params.spaceId
      ? [params.spaceId]
      : await this.spaceMemberRepo.getUserSpaceIds(scope.userId);
    const hits = await this.typesense.search({
      query,
      workspaceId: scope.workspaceId,
      spaceIds,
      creatorId: params.creatorId,
      labelIds: params.labelIds,
      // some hits will be dropped by permissions
      limit: limit * 2,
    });
    const pages = await this.searchService.hydrateReadablePages(
      hits.map((h) => h.id),
      params,
      scope,
    );
    const highlights = new Map(hits.map((h) => [h.id, h.highlight]));
    const items = pages.slice(0, limit).map((page, index) =>
      this.searchService.toSearchResult({
        ...page,
        rank: 1 - index / limit,
        highlight: highlights.get(page.id) ?? '',
      }),
    );
    return { items };
  }

  // Pages whose passages are close in meaning to the query.
  private async semanticPages(
    params: SearchDTO,
    scope: Scope,
    query: string,
    limit: number,
  ): Promise<SearchResponseDto[]> {
    const hits = relevantHits(
      await this.vectors.search(scope.workspaceId, query),
    );
    if (hits.length === 0) return [];

    // attachment passages lead to the page that holds the file
    const attachmentIds = hits.map((h) => h.attachmentId).filter(Boolean);
    const attachmentPages = new Map<string, string>();
    if (attachmentIds.length > 0) {
      const rows = await this.db
        .selectFrom('attachments')
        .select(['id', 'pageId'])
        .where('id', 'in', attachmentIds)
        .execute();
      for (const row of rows) {
        if (row.pageId) attachmentPages.set(row.id, row.pageId);
      }
    }

    // closest passage per page, pages ordered by that distance
    const best = new Map<string, { content: string; distance: number }>();
    for (const hit of hits) {
      const pageId =
        hit.pageId ??
        (hit.attachmentId && attachmentPages.get(hit.attachmentId));
      if (!pageId || best.has(pageId)) continue;
      best.set(pageId, { content: hit.content, distance: hit.distance });
    }

    const pages = await this.searchService.hydrateReadablePages(
      [...best.keys()],
      params,
      scope,
    );
    return pages.slice(0, limit).map((page, index) => ({
      ...page,
      rank: 1 - index / limit,
      highlight: snippet(best.get(page.id).content),
      matchedText: [],
      wholeWord: true,
      semantic: true,
    }));
  }

  // PDF, DOCX and TXT files by name and content.
  async searchAttachments(params: SearchDTO, scope: Scope) {
    const query = params.query?.trim() ?? '';
    if (query.length < 1) return { items: [] };
    const limit = params.limit || 25;
    const searchQuery = tsquery(query + '*');
    const tsq = sql<string>`to_tsquery('simple', f_unaccent(${searchQuery}))`;

    const base = async () => {
      let qb = this.db
        .selectFrom('attachments')
        .innerJoin('pages', 'pages.id', 'attachments.pageId')
        .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
        .select([
          'attachments.id',
          'attachments.fileName',
          'attachments.pageId',
          'attachments.creatorId',
          'attachments.createdAt',
          'attachments.updatedAt',
          'spaces.id as spaceId',
          'spaces.name as spaceName',
          'spaces.slug as spaceSlug',
          'pages.title as pageTitle',
          'pages.slugId as pageSlugId',
        ])
        .where('attachments.workspaceId', '=', scope.workspaceId)
        .where('attachments.deletedAt', 'is', null)
        .where('pages.deletedAt', 'is', null);
      if (params.spaceId) {
        qb = qb.where('pages.spaceId', '=', params.spaceId);
      } else {
        qb = qb.where(
          'pages.spaceId',
          'in',
          this.spaceMemberRepo.getUserSpaceIdsQuery(scope.userId),
        );
      }
      return qb;
    };

    const keywordRows = await (
      await base()
    )
      .select(sql<number>`ts_rank(attachments.tsv, ${tsq})`.as('rank'))
      .where(sql<boolean>`attachments.tsv @@ ${tsq}`)
      .orderBy('rank', 'desc')
      .limit(limit)
      .execute();

    let semanticRows: typeof keywordRows = [];
    const snippets = new Map<string, string>();
    if (query.length >= 3) {
      try {
        const hits = relevantHits(
          await withTimeout(
            this.vectors.search(scope.workspaceId, query),
            SEMANTIC_TIMEOUT_MS,
          ),
        ).filter((h) => h.attachmentId);
        const ids = [...new Set(hits.map((h) => h.attachmentId))];
        for (const hit of hits) {
          if (!snippets.has(hit.attachmentId)) {
            snippets.set(hit.attachmentId, snippet(hit.content));
          }
        }
        if (ids.length > 0) {
          const rows = await (
            await base()
          )
            .select(sql<number>`0`.as('rank'))
            .where('attachments.id', 'in', ids)
            .execute();
          const byId = new Map(rows.map((r) => [r.id, r]));
          semanticRows = ids.map((id) => byId.get(id)).filter(Boolean);
        }
      } catch (err) {
        this.logger.debug(
          `Semantic attachment search skipped: ${(err as Error).message}`,
        );
      }
    }

    const rowById = new Map<string, (typeof keywordRows)[number]>();
    for (const row of semanticRows) rowById.set(row.id, row);
    for (const row of keywordRows) rowById.set(row.id, row);
    const order = fuseRankings([
      keywordRows.map((r) => r.id),
      semanticRows.map((r) => r.id),
    ]).slice(0, limit);

    // page-level permissions of the pages holding the files
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: [...new Set(order.map((id) => rowById.get(id).pageId))],
        userId: scope.userId,
        spaceId: params.spaceId,
      }),
    );
    const readable = order.filter((id) =>
      accessible.has(rowById.get(id).pageId),
    );

    const highlights = new Map<string, string>();
    if (readable.length > 0) {
      const rows = await this.db
        .selectFrom('attachments')
        .select([
          'id',
          sql<string>`ts_headline('simple', substring(text_content, 1, 100000), ${tsq}, 'MinWords=9, MaxWords=10, MaxFragments=3')`.as(
            'highlight',
          ),
        ])
        .where('id', 'in', readable)
        .execute();
      for (const row of rows) highlights.set(row.id, row.highlight);
    }

    return {
      items: readable.map((id) => {
        const row = rowById.get(id);
        return {
          id: row.id,
          fileName: row.fileName,
          pageId: row.pageId,
          creatorId: row.creatorId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          rank: String(row.rank),
          highlight:
            (highlights.get(id) ?? '').replace(/\s+/g, ' ') ||
            snippets.get(id) ||
            '',
          space: {
            id: row.spaceId,
            name: row.spaceName,
            slug: row.spaceSlug,
            icon: null as string | null,
          },
          page: {
            id: row.pageId,
            title: row.pageTitle,
            slugId: row.pageSlugId,
          },
        };
      }),
    };
  }
}
