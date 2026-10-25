import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { BaseProperty, BaseRow, User } from '@docmost/db/types/entity.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { validate as isValidUUID } from 'uuid';

export type ResolvedPage = {
  id: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  spaceId: string;
  space: { id: string; slug: string; name: string } | null;
};

export type RowReferences = {
  users: Record<string, { id: string; name: string | null; avatarUrl: string | null }>;
  pages: Record<string, ResolvedPage>;
};

const asIds = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v == null ? [] : [v]).filter(
    (x): x is string => typeof x === 'string',
  );

// Resolves the users and pages that cells point at, so the grid can render
// names without one request per cell.
@Injectable()
export class BaseReferenceService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  async forRows(
    rows: BaseRow[],
    properties: BaseProperty[],
    user: User,
    workspaceId: string,
  ): Promise<RowReferences> {
    const personProps = properties.filter((p) => p.type === 'person');
    const pageProps = properties.filter((p) => p.type === 'page');
    const userIds = new Set<string>();
    const pageIds = new Set<string>();

    for (const row of rows) {
      const cells = row.cells as Record<string, unknown>;
      for (const p of personProps) asIds(cells[p.id]).forEach((i) => userIds.add(i));
      for (const p of pageProps) asIds(cells[p.id]).forEach((i) => pageIds.add(i));
      if (row.creatorId) userIds.add(row.creatorId);
      if (row.lastUpdatedById) userIds.add(row.lastUpdatedById);
    }

    const [users, pages] = await Promise.all([
      this.users([...userIds], workspaceId),
      this.expandPages([...pageIds], user, workspaceId),
    ]);
    return {
      users,
      pages: Object.fromEntries(pages.map((p) => [p.id, p])),
    };
  }

  private async users(ids: string[], workspaceId: string) {
    const valid = ids.filter((i) => isValidUUID(i));
    if (valid.length === 0) return {};
    const rows = await this.db
      .selectFrom('users')
      .select(['id', 'name', 'avatarUrl'])
      .where('id', 'in', valid)
      .where('workspaceId', '=', workspaceId)
      .execute();
    return Object.fromEntries(rows.map((u) => [u.id, u]));
  }

  // Pages the user can open, with their space. Others are left out.
  async expandPages(
    ids: string[],
    user: User,
    workspaceId: string,
  ): Promise<ResolvedPage[]> {
    const valid = [...new Set(ids.filter((i) => isValidUUID(i)))];
    if (valid.length === 0) return [];

    const spaceIds = new Set(await this.spaceMemberRepo.getUserSpaceIds(user.id));
    const rows = await this.db
      .selectFrom('pages')
      .leftJoin('spaces', 'spaces.id', 'pages.spaceId')
      .select([
        'pages.id',
        'pages.slugId',
        'pages.title',
        'pages.icon',
        'pages.spaceId',
        'spaces.slug as spaceSlug',
        'spaces.name as spaceName',
      ])
      .where('pages.id', 'in', valid)
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.deletedAt', 'is', null)
      .execute();

    const inSpace = rows.filter((r) => spaceIds.has(r.spaceId));
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: inSpace.map((r) => r.id),
        userId: user.id,
      }),
    );
    return inSpace
      .filter((r) => accessible.has(r.id))
      .map((r) => ({
        id: r.id,
        slugId: r.slugId,
        title: r.title,
        icon: r.icon,
        spaceId: r.spaceId,
        space: r.spaceSlug
          ? { id: r.spaceId, slug: r.spaceSlug, name: r.spaceName }
          : null,
      }));
  }
}
