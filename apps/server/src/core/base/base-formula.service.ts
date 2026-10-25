import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseProperty, BaseRow } from '@docmost/db/types/entity.types';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { EventName } from '../../common/events/event.contants';
import { emitBaseEvent, FORMULA_BATCH_SIZE } from './base.events';
import { FormulaEvaluator } from './engine/formula.engine';
import { SYSTEM_PROPERTY_TYPES } from './engine/base.types';

export function toEngineProperty(p: BaseProperty) {
  return { id: p.id, type: p.type, typeOptions: p.typeOptions as any };
}

// Applies a patch the way jsonb_set_many does: null removes the key.
export function applyCellPatch(
  cells: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...cells };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

function isErrorValue(v: unknown): boolean {
  return typeof v === 'object' && v !== null && '__err' in (v as object);
}

@Injectable()
export class BaseFormulaService {
  private readonly logger = new Logger(BaseFormulaService.name);

  constructor(
    private readonly rowRepo: BaseRowRepo,
    private readonly propertyRepo: BasePropertyRepo,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Recomputes the formulas affected by a row write and stores the results.
  // `changedIds` is 'all' for a new row. Returns the row with fresh cells and
  // the formula cells that were written.
  async recomputeRow(
    row: BaseRow,
    properties: BaseProperty[],
    changedIds: string[] | 'all',
    trx?: KyselyTransaction,
  ): Promise<{ row: BaseRow; computed: Record<string, unknown> }> {
    const evaluator = new FormulaEvaluator(properties.map(toEngineProperty));
    if (!evaluator.hasFormulas()) return { row, computed: {} };

    let formulaIds: string[];
    if (changedIds === 'all') {
      formulaIds = evaluator.allFormulaIds();
    } else {
      // any write touches updatedAt / lastEditedBy
      const system = properties
        .filter((p) => SYSTEM_PROPERTY_TYPES.has(p.type))
        .map((p) => p.id);
      formulaIds = evaluator.affected([...changedIds, ...system]);
    }
    if (formulaIds.length === 0) return { row, computed: {} };

    const computed = evaluator.evaluateRow(
      {
        cells: row.cells as Record<string, unknown>,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastEditedBy: row.lastUpdatedById ?? row.creatorId,
      },
      formulaIds,
    );
    await this.rowRepo.applyPatches(
      row.pageId,
      [{ id: row.id, patch: computed }],
      trx,
    );
    return {
      row: {
        ...row,
        cells: applyCellPatch(row.cells as Record<string, unknown>, computed),
      } as BaseRow,
      computed,
    };
  }

  // Recomputes formulas for every row of a base (or just `rowIds`), in
  // batches, reporting progress through realtime events.
  async backfill(opts: {
    pageId: string;
    workspaceId: string;
    formulaIds: string[];
    jobId: string;
    actorId?: string | null;
    rowIds?: string[];
  }): Promise<{ processed: number; errored: number }> {
    const { pageId, workspaceId, jobId, actorId } = opts;
    const properties = await this.propertyRepo.findByPageId(pageId);
    const evaluator = new FormulaEvaluator(properties.map(toEngineProperty));
    const wanted = new Set(opts.formulaIds);
    // evaluation order, restricted to live formulas that were asked for
    const ids = evaluator.allFormulaIds().filter((id) => wanted.has(id));
    const base = { pageId, workspaceId, actorId: actorId ?? null };

    emitBaseEvent(this.eventEmitter, EventName.BASE_FORMULA_RECOMPUTE_STARTED, {
      ...base,
      propertyIds: ids,
      jobId,
    });

    let processed = 0;
    let errored = 0;
    try {
      if (ids.length > 0) {
        let after: string | null = null;
        const scoped = opts.rowIds ? [...opts.rowIds] : null;
        while (true) {
          const rows: BaseRow[] = scoped
            ? await this.rowRepo.findByIds(
                scoped.splice(0, FORMULA_BATCH_SIZE),
                pageId,
              )
            : await this.rowRepo.findBatch(pageId, after, FORMULA_BATCH_SIZE);
          if (rows.length === 0 && (!scoped || scoped.length === 0)) break;
          if (!scoped) after = rows[rows.length - 1].id;

          const patches = rows.map((row) => {
            const patch = evaluator.evaluateRow(
              {
                cells: row.cells as Record<string, unknown>,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                lastEditedBy: row.lastUpdatedById ?? row.creatorId,
              },
              ids,
            );
            if (Object.values(patch).some(isErrorValue)) errored++;
            return { id: row.id, patch };
          });
          await this.rowRepo.applyPatches(pageId, patches);
          processed += rows.length;

          emitBaseEvent(this.eventEmitter, EventName.BASE_ROWS_UPDATED, {
            ...base,
            rowIds: rows.map((r) => r.id),
            propertyIds: ids,
          });
          if (!scoped && rows.length < FORMULA_BATCH_SIZE) break;
        }
      }
    } finally {
      emitBaseEvent(
        this.eventEmitter,
        EventName.BASE_FORMULA_RECOMPUTE_COMPLETED,
        { ...base, propertyIds: ids, jobId, processed, errored },
      );
    }
    return { processed, errored };
  }
}
