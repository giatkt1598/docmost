import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
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

// Finds the pages a user may read that best answer a question, using the
// existing full-text index (no embeddings needed).
@Injectable()
export class AiSearchService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  async retrieve(opts: {
    question: string;
    userId: string;
    workspaceId: string;
    spaceId?: string;
  }): Promise<{ sources: AiSource[]; context: string }> {
    const terms = questionTerms(opts.question);
    const tsQuery = orTsQuery(terms);
    if (!tsQuery) return { sources: [], context: '' };

    const query = sql<string>`to_tsquery('english', f_unaccent(${tsQuery}))`;
    const rows = await this.db
      .selectFrom('pages')
      .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
      .select([
        'pages.id',
        'pages.slugId',
        'pages.title',
        'spaces.slug as spaceSlug',
        sql<string>`substring(pages.text_content, 1, 50000)`.as('text'),
      ])
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

    if (rows.length === 0) return { sources: [], context: '' };

    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: rows.map((r) => r.id),
        userId: opts.userId,
        spaceId: opts.spaceId,
      }),
    );
    const pages = rows
      .filter((r) => accessible.has(r.id))
      .slice(0, MAX_SOURCES);

    const perPage = Math.floor(CONTEXT_BUDGET / Math.max(1, pages.length));
    const sources: AiSource[] = [];
    const blocks: string[] = [];
    pages.forEach((page, i) => {
      const passage = bestPassages(page.text ?? '', terms, perPage);
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
}
