import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { jsonb } from '@docmost/db/repos/base/jsonb';
import { executeTx } from '@docmost/db/utils';
import { BaseProperty, Page, User } from '@docmost/db/types/entity.types';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { EventName } from '../../common/events/event.contants';
import {
  emitBaseEvent,
  MAX_ROWS_PER_BASE,
  ROW_RETENTION_DAYS,
} from './base.events';
import { guard } from './base.errors';
import { BaseFormulaService, toEngineProperty } from './base-formula.service';
import { BaseReferenceService } from './base-reference.service';
import { EngineProperty } from './engine/base.types';
import { compileFilter } from './engine/filter-compiler';
import { compileSorts } from './engine/sort-compiler';
import {
  defaultCells,
  parseFilter,
  parseSorts,
  validateCells,
} from './engine/schema.zod';
import {
  CreateRowDto,
  DeleteRowDto,
  DeleteRowsDto,
  ListRowsDto,
  ReorderRowDto,
  RestoreRowsDto,
  RowInfoDto,
  UpdateRowDto,
} from './dto/base.dto';

const DEFAULT_LIMIT = 100;

@Injectable()
export class BaseRowService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly rowRepo: BaseRowRepo,
    private readonly propertyRepo: BasePropertyRepo,
    private readonly formula: BaseFormulaService,
    private readonly references: BaseReferenceService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Inside a row write the schema is read with a share lock, so a type
  // change cannot slip in between validating the cells and writing them.
  private async schema(pageId: string, trx?: KyselyTransaction) {
    const properties = await this.propertyRepo.findByPageId(
      pageId,
      trx,
      trx ? 'share' : undefined,
    );
    const map = new Map<string, EngineProperty>(
      properties.map((p) => [p.id, toEngineProperty(p)]),
    );
    const pending = new Set(
      properties.filter((p) => p.pendingToken).map((p) => p.id),
    );
    return { properties, map, pending };
  }

  // Values of a property that is being converted would be written in the old
  // type and then lost, so such writes are refused until it finishes.
  private assertNotConverting(patch: object, pending: Set<string>) {
    if (Object.keys(patch).some((id) => pending.has(id))) {
      throw new ConflictException(
        'This property is being converted to a new type. Try again shortly.',
      );
    }
  }

  private async assertRowCapacity(pageId: string, adding: number) {
    const count = await this.rowRepo.count(pageId);
    if (count + adding > MAX_ROWS_PER_BASE) {
      throw new BadRequestException(
        `A base can hold at most ${MAX_ROWS_PER_BASE} rows`,
      );
    }
  }

  private assertPosition(position: string) {
    try {
      generateJitteredKeyBetween(position, null);
    } catch {
      throw new BadRequestException('Invalid position');
    }
  }

  private base(page: Page, user: User, requestId?: string | null) {
    return {
      pageId: page.id,
      workspaceId: page.workspaceId,
      actorId: user.id,
      requestId: requestId ?? null,
    };
  }

  // Without a user (public share viewers) only people's names are resolved.
  async list(page: Page, dto: ListRowsDto, user: User | null) {
    return guard(async () => {
      const { properties, map } = await this.schema(page.id);
      const filterTree =
        dto.filter && Object.keys(dto.filter).length > 0
          ? parseFilter(dto.filter)
          : null;
      const filter = filterTree ? compileFilter(filterTree, map) : null;
      const sorts = compileSorts(parseSorts(dto.sorts ?? []), map);
      const limit = dto.limit ?? DEFAULT_LIMIT;

      const result = await this.rowRepo.list({
        pageId: page.id,
        limit,
        cursor: dto.cursor,
        filter,
        sorts,
      });
      const references = user
        ? await this.references.forRows(
            result.items,
            properties,
            user,
            page.workspaceId,
          )
        : await this.references.forPublicRows(
            result.items,
            properties,
            page.workspaceId,
          );
      return {
        items: result.items,
        meta: {
          limit,
          hasNextPage: result.hasNextPage,
          hasPrevPage: !!dto.cursor,
          nextCursor: result.nextCursor,
          prevCursor: null,
        },
        references,
      };
    });
  }

  async info(page: Page, dto: RowInfoDto) {
    const row = await this.rowRepo.findById(dto.rowId, page.id);
    if (!row) throw new NotFoundException('Row not found');
    return row;
  }

  private async newRowPosition(page: Page, dto: CreateRowDto) {
    if (dto.position) {
      this.assertPosition(dto.position);
      return dto.position;
    }
    if (dto.afterRowId) {
      const after = await this.rowRepo.findById(dto.afterRowId, page.id);
      if (after) {
        const next = await this.rowRepo.nextPosition(page.id, after.position);
        return generateJitteredKeyBetween(after.position, next);
      }
    }
    const last = await this.rowRepo.lastPosition(page.id);
    return generateJitteredKeyBetween(last, null);
  }

  async create(page: Page, dto: CreateRowDto, user: User) {
    return guard(async () => {
      await this.assertRowCapacity(page.id, 1);
      const position = await this.newRowPosition(page, dto);

      const row = await executeTx(this.db, async (trx) => {
        const { properties, map, pending } = await this.schema(page.id, trx);
        const given = validateCells(dto.cells ?? {}, map);
        this.assertNotConverting(given, pending);
        const defaults = defaultCells(
          [...map.values()].filter((p) => !pending.has(p.id)),
        );
        const cells: Record<string, unknown> = { ...defaults };
        for (const [k, v] of Object.entries(given)) {
          if (v === null) delete cells[k];
          else cells[k] = v;
        }
        const inserted = await this.rowRepo.insert(
          {
            pageId: page.id,
            workspaceId: page.workspaceId,
            creatorId: user.id,
            lastUpdatedById: user.id,
            position,
            cells: jsonb(cells),
          },
          trx,
        );
        const { row: withFormulas } = await this.formula.recomputeRow(
          inserted,
          properties,
          'all',
          trx,
        );
        return withFormulas;
      });
      emitBaseEvent(this.eventEmitter, EventName.BASE_ROW_CREATED, {
        ...this.base(page, user, dto.requestId),
        row,
      });
      return row;
    });
  }

  async update(page: Page, dto: UpdateRowDto, user: User) {
    return guard(async () => {
      const existing = await this.rowRepo.findById(dto.rowId, page.id);
      if (!existing) throw new NotFoundException('Row not found');

      if (dto.position) this.assertPosition(dto.position);
      const hasCells = Object.keys(dto.cells ?? {}).length > 0;
      if (!hasCells && !dto.position) return existing;

      let patch: Record<string, unknown> = {};
      const { row, computed } = await executeTx(this.db, async (trx) => {
        const { properties, map, pending } = await this.schema(page.id, trx);
        patch = validateCells(dto.cells ?? {}, map);
        this.assertNotConverting(patch, pending);
        const hasPatch = Object.keys(patch).length > 0;
        const updated = await this.rowRepo.updateRow(
          existing.id,
          page.id,
          {
            cellsPatch: hasPatch ? patch : undefined,
            position: dto.position,
            userId: user.id,
          },
          trx,
        );
        if (!updated) throw new NotFoundException('Row not found');
        return hasPatch
          ? this.formula.recomputeRow(updated, properties, Object.keys(patch), trx)
          : { row: updated, computed: {} };
      });

      const base = this.base(page, user, dto.requestId);
      if (Object.keys(patch).length > 0) {
        emitBaseEvent(this.eventEmitter, EventName.BASE_ROW_UPDATED, {
          ...base,
          rowId: row.id,
          updatedCells: { ...patch, ...computed },
        });
      }
      if (dto.position && dto.position !== existing.position) {
        emitBaseEvent(this.eventEmitter, EventName.BASE_ROW_REORDERED, {
          ...base,
          rowId: row.id,
          position: dto.position,
        });
      }
      return row;
    });
  }

  async reorder(page: Page, dto: ReorderRowDto, user: User) {
    return guard(async () => {
      this.assertPosition(dto.position);
      const updated = await this.rowRepo.updateRow(dto.rowId, page.id, {
        position: dto.position,
        userId: user.id,
      });
      if (!updated) throw new NotFoundException('Row not found');
      emitBaseEvent(this.eventEmitter, EventName.BASE_ROW_REORDERED, {
        ...this.base(page, user, dto.requestId),
        rowId: updated.id,
        position: dto.position,
      });
    });
  }

  async delete(page: Page, dto: DeleteRowDto, user: User) {
    const ok = await this.rowRepo.softDelete(dto.rowId, page.id);
    if (!ok) throw new NotFoundException('Row not found');
    emitBaseEvent(this.eventEmitter, EventName.BASE_ROW_DELETED, {
      ...this.base(page, user, dto.requestId),
      rowId: dto.rowId,
    });
  }

  async deleteMany(page: Page, dto: DeleteRowsDto, user: User) {
    const deleted = await this.rowRepo.softDeleteMany(dto.rowIds, page.id);
    if (deleted.length === 0) return;
    emitBaseEvent(this.eventEmitter, EventName.BASE_ROWS_DELETED, {
      ...this.base(page, user, dto.requestId),
      rowIds: deleted,
    });
  }

  // Undo for deletes: rows come back while they are within the retention
  // window. Formulas are recomputed in case the schema changed meanwhile.
  async restoreMany(page: Page, dto: RestoreRowsDto, user: User) {
    return guard(async () => {
      await this.assertRowCapacity(page.id, dto.rowIds.length);
      const since = new Date(Date.now() - ROW_RETENTION_DAYS * 86_400_000);
      const rows = await executeTx(this.db, async (trx) => {
        const restored = await this.rowRepo.restoreMany(
          dto.rowIds,
          page.id,
          since,
          trx,
        );
        if (restored.length === 0) return [];
        const { properties } = await this.schema(page.id, trx);
        const out = [];
        for (const r of restored) {
          const { row } = await this.formula.recomputeRow(r, properties, 'all', trx);
          out.push(row);
        }
        return out;
      });
      const base = this.base(page, user, dto.requestId);
      for (const row of rows) {
        emitBaseEvent(this.eventEmitter, EventName.BASE_ROW_CREATED, {
          ...base,
          row,
        });
      }
      return { items: rows };
    });
  }
}
