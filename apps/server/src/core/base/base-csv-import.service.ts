import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { BaseProperty, Page, User } from '@docmost/db/types/entity.types';
import { jsonb } from '@docmost/db/repos/base/jsonb';
import { executeTx } from '@docmost/db/utils';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { EventName } from '../../common/events/event.contants';
import {
  generateBaseChoiceId,
  generateBasePropertyId,
} from '../../common/helpers/nanoid.utils';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { IBaseFormulaRecomputeJob } from '../../integrations/queue/constants/queue.interface';
import { emitBaseEvent, MAX_ROWS_PER_BASE } from './base.events';
import { guard } from './base.errors';
import { toEngineProperty } from './base-formula.service';
import { CHOICE_TYPES, READONLY_CELL_TYPES } from './engine/base.types';
import { CsvParseError, parseCsv } from './engine/csv-parse';
import { defaultCells } from './engine/schema.zod';
import { convertCell } from './engine/type-conversion';

const MAX_PROPERTIES = 200;
const INSERT_BATCH = 1000;
const CHOICE_COLORS = [
  'blue', 'green', 'orange', 'grape', 'teal', 'red', 'yellow', 'cyan',
  'pink', 'violet', 'lime', 'indigo', 'gray',
];
const TEXT_SIDE = { type: 'text', typeOptions: {} };
// multi-value cells: our CSV export joins with "; ", spreadsheets often ","
const splitList = (raw: string) =>
  raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

export type CsvImportResult = {
  imported: number;
  createdProperties: string[];
  skippedColumns: string[];
};

type Column = { index: number; prop: BaseProperty };

// Appends the rows of a CSV file to a base. Columns match properties by
// name; unknown columns become text properties when asked. Choice names
// that do not exist yet are added as new choices.
@Injectable()
export class BaseCsvImportService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly propertyRepo: BasePropertyRepo,
    private readonly rowRepo: BaseRowRepo,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QueueName.BASE_QUEUE) private readonly baseQueue: Queue,
  ) {}

  async importCsv(
    page: Page,
    file: Buffer,
    opts: { createMissing: boolean },
    user: User,
  ): Promise<CsvImportResult> {
    return guard(async () => {
      let records: string[][];
      try {
        records = parseCsv(file.toString('utf8'), MAX_ROWS_PER_BASE + 1);
      } catch (e) {
        if (e instanceof CsvParseError) throw new BadRequestException(e.message);
        throw e;
      }
      const [header, ...body] = records;
      if (!header || header.every((h) => !h.trim())) {
        throw new BadRequestException('The file has no header row');
      }
      const rows = body.filter((r) => r.some((v) => v.trim() !== ''));
      const existingCount = await this.rowRepo.count(page.id);
      if (existingCount + rows.length > MAX_ROWS_PER_BASE) {
        throw new BadRequestException(
          `A base can hold at most ${MAX_ROWS_PER_BASE} rows`,
        );
      }

      const base = { pageId: page.id, workspaceId: page.workspaceId, actorId: user.id };
      const result = await executeTx(this.db, async (trx) => {
        // the share lock keeps type changes out while rows are written
        const properties = await this.propertyRepo.findByPageId(page.id, trx, 'share');
        const { columns, created, skipped } = await this.mapColumns(
          page,
          header,
          properties,
          opts.createMissing,
          trx,
        );
        await this.addMissingChoices(page.id, columns, rows, trx);
        const lookupUser = await this.userLookup(page.workspaceId, columns, trx);
        const all = await this.propertyRepo.findByPageId(page.id, trx);
        const byId = new Map(all.map((p) => [p.id, p]));
        const defaults = defaultCells(
          all.filter((p) => !p.pendingToken).map(toEngineProperty),
        );

        let position = await this.rowRepo.lastPosition(page.id, trx);
        for (let i = 0; i < rows.length; i += INSERT_BATCH) {
          const chunk = rows.slice(i, i + INSERT_BATCH).map((record) => {
            const cells: Record<string, unknown> = { ...defaults };
            for (const col of columns) {
              const prop = byId.get(col.prop.id) ?? col.prop;
              const raw = (record[col.index] ?? '').trim();
              if (!raw) continue;
              const value = this.convert(raw, prop, lookupUser);
              if (value !== null && value !== undefined) cells[prop.id] = value;
            }
            position = generateJitteredKeyBetween(position, null);
            return {
              pageId: page.id,
              workspaceId: page.workspaceId,
              creatorId: user.id,
              lastUpdatedById: user.id,
              position,
              cells: jsonb(cells),
            };
          });
          await this.rowRepo.insertMany(chunk, trx);
        }
        const schemaVersion = await this.propertyRepo.bumpSchemaVersion(page.id, trx);
        const formulaIds = all.filter((p) => p.type === 'formula').map((p) => p.id);
        return { created, skipped, schemaVersion, formulaIds, columns };
      });

      for (const property of result.created) {
        emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_CREATED, {
          ...base,
          property,
        });
      }
      emitBaseEvent(this.eventEmitter, EventName.BASE_SCHEMA_BUMPED, {
        ...base,
        schemaVersion: result.schemaVersion,
      });
      if (rows.length && result.formulaIds.length) {
        const payload: IBaseFormulaRecomputeJob = {
          pageId: page.id,
          workspaceId: page.workspaceId,
          propertyIds: result.formulaIds,
          reason: 'bulk_import',
          actorId: user.id,
        };
        await this.baseQueue.add(QueueJob.BASE_FORMULA_RECOMPUTE, payload);
      }
      return {
        imported: rows.length,
        createdProperties: result.created.map((p) => p.name),
        skippedColumns: result.skipped,
      };
    });
  }

  private async mapColumns(
    page: Page,
    header: string[],
    properties: BaseProperty[],
    createMissing: boolean,
    trx: any,
  ) {
    const byName = new Map(
      properties.map((p) => [p.name.trim().toLowerCase(), p]),
    );
    const columns: Column[] = [];
    const created: BaseProperty[] = [];
    const skipped: string[] = [];
    const used = new Set<string>();
    let lastPosition = await this.propertyRepo.lastPosition(page.id, trx);

    for (const [index, rawName] of header.entries()) {
      const name = rawName.trim().slice(0, 500);
      if (!name) continue;
      let prop = byName.get(name.toLowerCase());
      if (!prop && createMissing) {
        if (properties.length + created.length >= MAX_PROPERTIES) {
          skipped.push(name);
          continue;
        }
        lastPosition = generateJitteredKeyBetween(lastPosition, null);
        prop = await this.propertyRepo.insert(
          {
            id: generateBasePropertyId(),
            pageId: page.id,
            workspaceId: page.workspaceId,
            name,
            type: 'text',
            typeOptions: jsonb({}),
            position: lastPosition,
            isPrimary: false,
          },
          trx,
        );
        byName.set(name.toLowerCase(), prop);
        created.push(prop);
      }
      if (
        !prop ||
        used.has(prop.id) ||
        prop.pendingToken ||
        READONLY_CELL_TYPES.has(prop.type) ||
        prop.type === 'file' ||
        prop.type === 'page'
      ) {
        skipped.push(name);
        continue;
      }
      used.add(prop.id);
      columns.push({ index, prop });
    }
    return { columns, created, skipped };
  }

  private async addMissingChoices(
    pageId: string,
    columns: Column[],
    rows: string[][],
    trx: any,
  ) {
    for (const { index, prop } of columns) {
      if (!CHOICE_TYPES.has(prop.type)) continue;
      const options: any = prop.typeOptions ?? {};
      const choices: any[] = [...(options.choices ?? [])];
      const known = new Set(choices.map((c) => String(c.name).trim().toLowerCase()));
      const added: any[] = [];
      for (const record of rows) {
        const raw = (record[index] ?? '').trim();
        if (!raw) continue;
        const names = prop.type === 'multiSelect' ? splitList(raw) : [raw];
        for (const name of names) {
          const key = name.toLowerCase();
          if (known.has(key)) continue;
          known.add(key);
          added.push({
            id: generateBaseChoiceId(),
            name: name.slice(0, 100),
            color: CHOICE_COLORS[(choices.length + added.length) % CHOICE_COLORS.length],
            ...(prop.type === 'status' ? { category: 'todo' } : {}),
          });
        }
      }
      if (added.length === 0) continue;
      const next = {
        ...options,
        choices: [...choices, ...added],
        choiceOrder: [
          ...(options.choiceOrder ?? choices.map((c) => c.id)),
          ...added.map((c) => c.id),
        ],
      };
      await this.propertyRepo.update(pageId, prop.id, { typeOptions: jsonb(next) }, trx);
    }
  }

  // People are matched by name or email, case-insensitively.
  private async userLookup(workspaceId: string, columns: Column[], trx: any) {
    const map = new Map<string, string>();
    if (!columns.some((c) => c.prop.type === 'person')) return map;
    const users = await trx
      .selectFrom('users')
      .select(['id', 'name', 'email'])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
    for (const u of users) {
      if (u.email) map.set(String(u.email).toLowerCase(), u.id);
      if (u.name && !map.has(String(u.name).toLowerCase())) {
        map.set(String(u.name).toLowerCase(), u.id);
      }
    }
    return map;
  }

  private convert(
    raw: string,
    prop: BaseProperty,
    users: Map<string, string>,
  ): unknown {
    const to = { type: prop.type, typeOptions: prop.typeOptions ?? {} };
    if (prop.type === 'person') {
      const ids = splitList(raw)
        .map((n) => users.get(n.toLowerCase()))
        .filter((id): id is string => !!id);
      if (ids.length === 0) return null;
      return (prop.typeOptions as any)?.allowMultiple ? [...new Set(ids)] : ids[0];
    }
    if (prop.type === 'multiSelect') {
      return convertCell(splitList(raw), TEXT_SIDE, to);
    }
    return convertCell(raw, TEXT_SIDE, to);
  }
}
