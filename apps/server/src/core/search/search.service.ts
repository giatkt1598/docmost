import { Injectable } from '@nestjs/common';
import { SearchDTO, SearchSuggestionDTO } from './dto/search.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsquery = require('pg-tsquery')();

@Injectable()
export class SearchService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private pageRepo: PageRepo,
    private shareRepo: ShareRepo,
    private spaceMemberRepo: SpaceMemberRepo,
    private pagePermissionRepo: PagePermissionRepo,
  ) {}

  // Pages visible within the scope of the request (space membership, share,
  // public space), before any page-level permission filtering. Null when the
  // scope can match nothing.
  private async scopedPages(
    searchParams: SearchDTO,
    opts: {
      userId?: string;
      workspaceId: string;
      publicPageIds?: string[];
    },
  ) {
    const labelIds = [...new Set(searchParams.labelIds ?? [])];

    let qb = this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'parentPageId',
        'creatorId',
        'createdAt',
        'updatedAt',
      ])
      .$if(Boolean(searchParams.creatorId), (qb) =>
        qb.where('creatorId', '=', searchParams.creatorId),
      )
      .$if(labelIds.length > 0, (qb) =>
        qb.where(
          'id',
          'in',
          this.db
            .selectFrom('pageLabels')
            .select('pageId')
            .where('labelId', 'in', labelIds),
        ),
      )
      .where('deletedAt', 'is', null);

    if (!searchParams.shareId && !opts.publicPageIds) {
      qb = qb.select((eb) => this.pageRepo.withSpace(eb));
    }

    if (searchParams.spaceId && opts.userId) {
      qb = qb.where('spaceId', '=', searchParams.spaceId);
    } else if (opts.userId && !searchParams.spaceId) {
      // only search spaces the user is a member of
      qb = qb
        .where(
          'spaceId',
          'in',
          this.spaceMemberRepo.getUserSpaceIdsQuery(opts.userId),
        )
        .where('workspaceId', '=', opts.workspaceId);
    } else if (opts.publicPageIds && !opts.userId) {
      // Public space search: the allowed id set is computed from live DB
      // state by the controller on every request.
      if (opts.publicPageIds.length === 0) {
        return null;
      }
      qb = qb
        .where('id', 'in', opts.publicPageIds)
        .where('workspaceId', '=', opts.workspaceId);
    } else if (searchParams.shareId && !searchParams.spaceId && !opts.userId) {
      // search in shares
      const share = await this.shareRepo.findById(searchParams.shareId);
      if (!share || share.workspaceId !== opts.workspaceId) {
        return null;
      }

      const isRestricted = await this.pagePermissionRepo.hasRestrictedAncestor(
        share.pageId,
      );
      if (isRestricted) {
        return null;
      }

      const pageIdsToSearch: string[] = [];
      if (share.includeSubPages) {
        const pageList =
          await this.pageRepo.getPageAndDescendantsExcludingRestricted(
            share.pageId,
            {
              includeContent: false,
            },
          );

        pageIdsToSearch.push(...pageList.map((page) => page.id));
      } else {
        pageIdsToSearch.push(share.pageId);
      }

      if (pageIdsToSearch.length === 0) {
        return null;
      }
      qb = qb
        .where('id', 'in', pageIdsToSearch)
        .where('workspaceId', '=', opts.workspaceId);
    } else {
      return null;
    }
    return qb;
  }

  // Drops the pages the user may not read through page-level permissions.
  private async filterReadable<T extends { id: string }>(
    rows: T[],
    searchParams: SearchDTO,
    userId?: string,
  ): Promise<T[]> {
    if (!userId || rows.length === 0) return rows;
    const accessibleIds = await this.pagePermissionRepo.filterAccessiblePageIds(
      {
        pageIds: rows.map((r) => r.id),
        userId,
        spaceId: searchParams.spaceId,
      },
    );
    const accessibleSet = new Set(accessibleIds);
    return rows.filter((r) => accessibleSet.has(r.id));
  }

  // Loads and authorizes pages found by another engine (Typesense, vectors),
  // keeping the order of the given ids. Postgres stays the source of truth for
  // who may read what.
  async hydrateReadablePages(
    ids: string[],
    searchParams: SearchDTO,
    opts: { userId?: string; workspaceId: string },
  ): Promise<any[]> {
    if (ids.length === 0) return [];
    const base = await this.scopedPages(searchParams, opts);
    if (!base) return [];
    const rows: any[] = await base.where('id', 'in', ids).execute();
    const readable = await this.filterReadable(rows, searchParams, opts.userId);
    const byId = new Map(readable.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  async searchPage(
    searchParams: SearchDTO,
    opts: {
      userId?: string;
      workspaceId: string;
      publicPageIds?: string[];
    },
  ): Promise<{ items: SearchResponseDto[] }> {
    const query = searchParams.query?.trim() ?? '';
    const labelIds = [...new Set(searchParams.labelIds ?? [])];
    // selected filters (labels, creator) are browsable without a query
    const browseByFilters =
      query.length < 1 &&
      (labelIds.length > 0 || Boolean(searchParams.creatorId));

    if (query.length < 1 && !browseByFilters) {
      return { items: [] };
    }
    const searchQuery = tsquery(query + '*');
    const titleOnly = searchParams.titleOnly === true;
    const titleQuery = query;
    // escape LIKE wildcards; ranking keeps the raw query
    const titleLikeQuery = query.replace(/[\\%_]/g, '\\$&');
    const limit = searchParams.limit || 25;
    const offset = searchParams.offset || 0;

    const base = await this.scopedPages(searchParams, opts);
    if (!base) return { items: [] };

    const rankColumn = browseByFilters
      ? sql<number>`0`.as('rank')
      : titleOnly
        ? sql<number>`word_similarity(lower(${titleQuery}), lower(pages.title))`.as(
            'rank',
          )
        : // titles that match with their accents rank above accent-stripped twins
          sql<number>`ts_rank(tsv, to_tsquery('simple', f_unaccent(${searchQuery}))) + 0.5 * word_similarity(lower(${titleQuery}), lower(pages.title))`.as(
            'rank',
          );

    const queryResults = base
      .select(rankColumn)
      .$if(!browseByFilters && !titleOnly, (qb) =>
        qb.where(
          'tsv',
          '@@',
          sql<string>`to_tsquery('simple', f_unaccent(${searchQuery}))`,
        ),
      )
      .$if(!browseByFilters && titleOnly, (qb) =>
        qb.where((eb) =>
          eb(
            sql`lower(pages.title)`,
            'like',
            sql`lower(${`%${titleLikeQuery}%`})`,
          ),
        ),
      )
      .$if(browseByFilters, (qb) => qb.orderBy('updatedAt', 'desc'))
      .$if(!browseByFilters, (qb) => qb.orderBy('rank', 'desc'))
      .limit(limit)
      .offset(offset);

    //@ts-ignore
    let results: any[] = await queryResults.execute();
    results = await this.filterReadable(results, searchParams, opts.userId);

    // Typo tolerance: when full-text matching leaves room, add the pages whose
    // title is merely similar to the query.
    if (
      !browseByFilters &&
      !titleOnly &&
      offset === 0 &&
      results.length < limit &&
      query.length >= 3
    ) {
      const seen = new Set<string>(results.map((r) => r.id));
      const fuzzyBase = await this.scopedPages(searchParams, opts);
      const fuzzy: any[] = await fuzzyBase
        .select(
          sql<number>`word_similarity(f_unaccent(lower(${titleQuery})), f_unaccent(lower(pages.title)))`.as(
            'rank',
          ),
        )
        .where(
          sql<boolean>`word_similarity(f_unaccent(lower(${titleQuery})), f_unaccent(lower(pages.title))) > 0.45`,
        )
        .$if(seen.size > 0, (qb) => qb.where('id', 'not in', [...seen]))
        .orderBy('rank', 'desc')
        .limit(limit - results.length)
        .execute();
      results.push(
        ...(await this.filterReadable(fuzzy, searchParams, opts.userId)),
      );
    }

    if (!browseByFilters && !titleOnly) {
      await this.addHighlights(results, searchQuery);
    }

    return { items: results.map((r) => this.toSearchResult(r)) };
  }

  private async addHighlights(results: any[], searchQuery: string) {
    if (results.length === 0) return;
    const highlights = await this.db
      .selectFrom('pages')
      .select([
        'id',
        sql<string>`ts_headline('simple', substring(text_content, 1, 100000), to_tsquery('simple', f_unaccent(${searchQuery})),'MinWords=9, MaxWords=10, MaxFragments=3')`.as(
          'highlight',
        ),
      ])
      .where(
        'id',
        'in',
        results.map((r: any) => r.id),
      )
      .execute();
    const highlightById = new Map(highlights.map((h) => [h.id, h.highlight]));
    for (const result of results) {
      result.highlight = highlightById.get(result.id) ?? '';
    }
  }

  // Normalizes the highlight of a result and lists the matched words.
  toSearchResult(result: any): SearchResponseDto {
    result.wholeWord = true;
    if (!result.highlight) {
      result.highlight = '';
      result.matchedText = [];
      return result;
    }

    result.highlight = result.highlight
      .replace(/\r\n|\r|\n/g, ' ')
      .replace(/\s+/g, ' ');

    result.matchedText = [
      ...new Set(
        Array.from(
          result.highlight.matchAll(/<b>([^<]*)<\/b>/gi),
          (match: RegExpMatchArray) => match[1],
        ),
      ),
    ];

    return result;
  }

  async searchSuggestions(
    suggestion: SearchSuggestionDTO,
    userId: string,
    workspaceId: string,
  ) {
    let users = [];
    let groups = [];
    let pages = [];

    const limit = suggestion?.limit || 10;
    const query = suggestion.query.toLowerCase().trim();

    if (suggestion.includeUsers) {
      const userQuery = this.db
        .selectFrom('users')
        .select(['id', 'name', 'email', 'avatarUrl'])
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .where((eb) =>
          eb.or([
            eb(
              sql`LOWER(f_unaccent(users.name))`,
              'like',
              sql`LOWER(f_unaccent(${`%${query}%`}))`,
            ),
            eb(sql`users.email`, 'ilike', sql`f_unaccent(${`%${query}%`})`),
          ]),
        )
        .limit(limit);

      users = await userQuery.execute();
    }

    if (suggestion.includeGroups) {
      groups = await this.db
        .selectFrom('groups')
        .select(['id', 'name', 'description'])
        .where((eb) =>
          eb(
            sql`LOWER(f_unaccent(groups.name))`,
            'like',
            sql`LOWER(f_unaccent(${`%${query}%`}))`,
          ),
        )
        .where('workspaceId', '=', workspaceId)
        .limit(limit)
        .execute();
    }

    if (suggestion.includePages) {
      let pageSearch = this.db
        .selectFrom('pages')
        .select(['id', 'slugId', 'title', 'icon', 'spaceId'])
        .select((eb) => this.pageRepo.withSpace(eb))
        .where((eb) =>
          eb(
            sql`LOWER(f_unaccent(pages.title))`,
            'like',
            sql`LOWER(f_unaccent(${`%${query}%`}))`,
          ),
        )
        .where('deletedAt', 'is', null)
        .where('workspaceId', '=', workspaceId)
        .limit(limit);

      // search all spaces the user has access to, prioritizing the current space
      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(userId);

      if (userSpaceIds?.length > 0) {
        pageSearch = pageSearch.where('spaceId', 'in', userSpaceIds);

        if (suggestion?.spaceId) {
          pageSearch = pageSearch.orderBy(
            sql`CASE WHEN pages."space_id" = ${suggestion.spaceId} THEN 0 ELSE 1 END`,
            'asc',
          );
        }

        pages = await pageSearch.execute();
      }

      // Filter by page-level permissions
      if (pages.length > 0) {
        const pageIds = pages.map((p) => p.id);
        const accessibleIds =
          await this.pagePermissionRepo.filterAccessiblePageIds({
            pageIds,
            userId,
          });
        const accessibleSet = new Set(accessibleIds);
        pages = pages.filter((p) => accessibleSet.has(p.id));
      }
    }

    return { users, groups, pages };
  }
}
