import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { BaseProperty, Page, User } from '@docmost/db/types/entity.types';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { EventName } from '../../common/events/event.contants';
import { emitBaseEvent } from './base.events';
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

  private async schema(pageId: string) {
    const properties = await this.propertyRepo.findByPageId(pageId);
    const map = new Map<string, EngineProperty>(
      properties.map((p) => [p.id, toEngineProperty(p)]),
    );
    return { properties, map };
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

  async list(page: Page, dto: ListRowsDto, user: User) {
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
      const references = await this.references.forRows(
        result.items,
        properties,
        user,
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
      const { properties, map } = await this.schema(page.id);
      const given = validateCells(dto.cells ?? {}, map);
      const cells: Record<string, unknown> = { ...defaultCells(map.values()) };
      for (const [k, v] of Object.entries(given)) {
        if (v === null) delete cells[k];
        else cells[k] = v;
      }
      const position = await this.newRowPosition(page, dto);

      const row = await executeTx(this.db, async (trx) => {
        const inserted = await this.rowRepo.insert(
          {
            pageId: page.id,
            workspaceId: page.workspaceId,
            creatorId: user.id,
            lastUpdatedById: user.id,
            position,
            cells: JSON.stringify(cells),
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

      const { properties, map } = await this.schema(page.id);
      const patch = validateCells(dto.cells ?? {}, map);
      if (dto.position) this.assertPosition(dto.position);
      const hasPatch = Object.keys(patch).length > 0;
      if (!hasPatch && !dto.position) return existing;

      const { row, computed } = await executeTx(this.db, async (trx) => {
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
      if (hasPatch) {
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
}
