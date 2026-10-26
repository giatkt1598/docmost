import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import {
  relevantHits,
  VectorSearchService,
} from '../embedding/vector-search.service';
import { fuseRankings } from '../search/rrf';
import { bestPassages, orTsQuery, questionTerms } from './ai-retrieval';

export type AiSource = {
  index: number;
  pageId: string;
  slugId: string;
  title: string;
  spaceSlug: string;
  excerpt: string;
};

const CANDIDATES = 20;
const MAX_SOURCES = 5;
const CONTEXT_BUDGET = 6000;
const SEMANTIC_TIMEOUT_MS = 6000;
const CHUNKS_PER_PAGE = 2;

type Passage = { content: string; distance: number; file?: string };

// Finds the pages a user may read that best answer a question: the
// full-text index finds pages that use the question's words, embeddings find
// passages that mean the same thing (pages and attached files); the two
// rankings are merged.
@Injectable()
export class AiSearchService {
  private readonly logger = new Logger(AiSearchService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly vectors: VectorSearchService,
  ) {}

  async retrieve(opts: {
    question: string;
    userId: string;
    workspaceId: string;
    spaceId?: string;
  }): Promise<{ sources: AiSource[]; context: string }> {
    const terms = questionTerms(opts.question);
    const tsQuery = orTsQuery(terms);

    const [keywordIds, semantic] = await Promise.all([
      tsQuery ? this.keywordPageIds(tsQuery, opts) : Promise.resolve([]),
      this.semanticPassages(opts.question, opts.workspaceId),
    ]);

    const semanticIds = [...semantic.keys()];
    const ranked = fuseRankings([keywordIds, semanticIds]).slice(0, CANDIDATES);
    if (ranked.length === 0) return { sources: [], context: '' };

    const rows = await this.loadPages(ranked, opts);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const readable = rows.length
      ? new Set(
          await this.pagePermissionRepo.filterAccessiblePageIds({
            pageIds: rows.map((r) => r.id),
            userId: opts.userId,
            spaceId: opts.spaceId,
          }),
        )
      : new Set<string>();
    const pages = ranked
      .filter((id) => readable.has(id))
      .map((id) => byId.get(id))
      .slice(0, MAX_SOURCES);
    if (pages.length === 0) return { sources: [], context: '' };

    const perPage = Math.floor(CONTEXT_BUDGET / pages.length);
    const sources: AiSource[] = [];
    const blocks: string[] = [];
    pages.forEach((page, i) => {
      const passages = semantic.get(page.id);
      const passage = passages?.length
        ? this.joinPassages(passages, perPage)
        : bestPassages(page.text ?? '', terms, perPage);
      const title = page.title || 'Untitled';
      sources.push({
        index: i + 1,
        pageId: page.id,
        slugId: page.slugId,
        title,
        spaceSlug: page.spaceSlug,
        excerpt: passage.slice(0, 240),
      });
      blocks.push(`[${i + 1}] ${title}\n${passage}`);
    });
    return { sources, context: blocks.join('\n\n---\n\n') };
  }

  private joinPassages(passages: Passage[], budget: number): string {
    return [...passages]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, CHUNKS_PER_PAGE)
      .map((p) => (p.file ? `(${p.file}) ${p.content}` : p.content))
      .join('\n')
      .slice(0, budget);
  }

  private async keywordPageIds(
    tsQuery: string,
    opts: { userId: string; workspaceId: string; spaceId?: string },
  ): Promise<string[]> {
    const query = sql<string>`to_tsquery('simple', f_unaccent(${tsQuery}))`;
    const rows = await this.db
      .selectFrom('pages')
      .select('pages.id')
      .where('pages.workspaceId', '=', opts.workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where(
        'pages.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(opts.userId),
      )
      .$if(!!opts.spaceId, (qb) => qb.where('pages.spaceId', '=', opts.spaceId))
      .where('pages.tsv', '@@', query)
      .orderBy(sql`ts_rank_cd(pages.tsv, ${query})`, 'desc')
      .limit(CANDIDATES)
      .execute();
    return rows.map((r) => r.id);
  }

  // Passages close in meaning to the question, grouped by the page they
  // belong to (an attached file counts for the page that holds it).
  private async semanticPassages(
    question: string,
    workspaceId: string,
  ): Promise<Map<string, Passage[]>> {
    const result = new Map<string, Passage[]>();
    let hits;
    try {
      hits = relevantHits(
        await Promise.race([
          this.vectors.search(workspaceId, question, 30),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), SEMANTIC_TIMEOUT_MS),
          ),
        ]),
      );
    } catch (err) {
      this.logger.debug(
        `Semantic retrieval skipped: ${(err as Error).message}`,
      );
      return result;
    }
    if (hits.length === 0) return result;

    const attachmentIds = [
      ...new Set(hits.map((h) => h.attachmentId).filter(Boolean)),
    ] as string[];
    const attachments = new Map<string, { pageId: string; fileName: string }>();
    if (attachmentIds.length > 0) {
      const rows = await this.db
        .selectFrom('attachments')
        .select(['id', 'pageId', 'fileName'])
        .where('id', 'in', attachmentIds)
        .execute();
      for (const row of rows) {
        if (row.pageId) {
          attachments.set(row.id, {
            pageId: row.pageId,
            fileName: row.fileName,
          });
        }
      }
    }

    // pages in order of their closest passage
    for (const hit of hits) {
      const attachment = hit.attachmentId
        ? attachments.get(hit.attachmentId)
        : undefined;
      const pageId = hit.pageId ?? attachment?.pageId;
      if (!pageId) continue;
      const list = result.get(pageId) ?? [];
      list.push({
        content: hit.content,
        distance: hit.distance,
        file: attachment?.fileName,
      });
      result.set(pageId, list);
    }
    return result;
  }

  private async loadPages(
    ids: string[],
    opts: { userId: string; workspaceId: string; spaceId?: string },
  ) {
    return this.db
      .selectFrom('pages')
      .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
      .select([
        'pages.id',
        'pages.slugId',
        'pages.title',
        'spaces.slug as spaceSlug',
        sql<string>`substring(pages.text_content, 1, 50000)`.as('text'),
      ])
      .where('pages.id', 'in', ids)
      .where('pages.workspaceId', '=', opts.workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where(
        'pages.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(opts.userId),
      )
      .$if(!!opts.spaceId, (qb) => qb.where('pages.spaceId', '=', opts.spaceId))
      .execute();
  }
}
