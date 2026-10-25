import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { BaseRow } from '@docmost/db/types/entity.types';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import {
  ConversionLookups,
  ConversionSide,
  convertCell,
  referencedIds,
} from './engine/type-conversion';

export const CONVERSION_BATCH_SIZE = 500;

// Cell key that holds a converted value until the conversion commits.
export const stagedKeyFor = (propertyId: string) => `${propertyId}__staged`;

// Rewrites one property of a base from an old type to a new one.
@Injectable()
export class BaseConversionService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly rowRepo: BaseRowRepo,
  ) {}

  async loadLookups(
    fromType: string,
    values: unknown[],
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<ConversionLookups> {
    const { userIds, pageIds } = referencedIds(fromType, values);
    const db = dbOrTx(this.db, trx);
    const userNames = new Map<string, string>();
    const pageTitles = new Map<string, string>();
    if (userIds.length) {
      const users = await db
        .selectFrom('users')
        .select(['id', 'name'])
        .where('id', 'in', userIds)
        .where('workspaceId', '=', workspaceId)
        .execute();
      for (const u of users) userNames.set(u.id, u.name ?? '');
    }
    if (pageIds.length) {
      const pages = await db
        .selectFrom('pages')
        .select(['id', 'slugId', 'title'])
        .where('workspaceId', '=', workspaceId)
        .where((eb) =>
          eb.or([eb('id', 'in', pageIds), eb('slugId', 'in', pageIds)]),
        )
        .execute();
      for (const p of pages) {
        pageTitles.set(p.id, p.title ?? '');
        pageTitles.set(p.slugId, p.title ?? '');
      }
    }
    return { userNames, pageTitles };
  }

  // Converts one batch of rows and writes the new cell values.
  async convertRows(opts: {
    pageId: string;
    workspaceId: string;
    propertyId: string;
    from: ConversionSide;
    to: ConversionSide;
    clearMode: boolean;
    rows: BaseRow[];
    trx?: KyselyTransaction;
    // write the result here instead of over the old value
    stagedKey?: string;
  }): Promise<number> {
    const { propertyId, rows } = opts;
    const touched = rows.filter(
      (r) => (r.cells as Record<string, unknown>)[propertyId] != null,
    );
    if (touched.length === 0) return 0;
    const lookups = opts.clearMode
      ? undefined
      : await this.loadLookups(
          opts.from.type,
          touched.map((r) => (r.cells as Record<string, unknown>)[propertyId]),
          opts.workspaceId,
          opts.trx,
        );
    const patches = touched.map((r) => {
      const value = (r.cells as Record<string, unknown>)[propertyId];
      const next = opts.clearMode
        ? null
        : convertCell(value, opts.from, opts.to, lookups);
      return { id: r.id, patch: { [opts.stagedKey ?? propertyId]: next } };
    });
    await this.rowRepo.applyPatches(opts.pageId, patches, opts.trx, true);
    return touched.length;
  }

  // Walks every row of the base and converts the property.
  async convertAll(opts: {
    pageId: string;
    workspaceId: string;
    propertyId: string;
    from: ConversionSide;
    to: ConversionSide;
    clearMode: boolean;
    trx?: KyselyTransaction;
    isStale?: () => Promise<boolean>;
    stagedKey?: string;
  }): Promise<number> {
    let after: string | null = null;
    let total = 0;
    while (true) {
      if (opts.isStale && (await opts.isStale())) return total;
      const rows = await this.rowRepo.findBatch(
        opts.pageId,
        after,
        CONVERSION_BATCH_SIZE,
        opts.trx,
        { includeDeleted: true },
      );
      if (rows.length === 0) return total;
      after = rows[rows.length - 1].id;
      total += await this.convertRows({ ...opts, rows });
      if (rows.length < CONVERSION_BATCH_SIZE) return total;
    }
  }
}
