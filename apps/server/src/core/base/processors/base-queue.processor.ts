import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import {
  IBaseCellGcJob,
  IBaseFormulaRecomputeJob,
  IBaseTypeConversionJob,
} from '../../../integrations/queue/constants/queue.interface';
import { EventName } from '../../../common/events/event.contants';
import { emitBaseEvent } from '../base.events';
import { BaseConversionService } from '../base-conversion.service';
import { BaseFormulaService, toEngineProperty } from '../base-formula.service';
import { FormulaEvaluator } from '../engine/formula.engine';

const GC_BATCH = 1000;

@Processor(QueueName.BASE_QUEUE)
export class BaseQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(BaseQueueProcessor.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly propertyRepo: BasePropertyRepo,
    private readonly rowRepo: BaseRowRepo,
    private readonly conversion: BaseConversionService,
    private readonly formula: BaseFormulaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case QueueJob.BASE_TYPE_CONVERSION:
        return this.typeConversion(job.data as IBaseTypeConversionJob);
      case QueueJob.BASE_CELL_GC:
        return this.cellGc(job.data as IBaseCellGcJob);
      case QueueJob.BASE_FORMULA_RECOMPUTE:
        return this.formulaRecompute(
          job.data as IBaseFormulaRecomputeJob,
          String(job.id),
        );
    }
  }

  private async cellGc(data: IBaseCellGcJob) {
    while (true) {
      const n = await this.rowRepo.removeCellKey(
        data.pageId,
        data.propertyId,
        GC_BATCH,
      );
      if (n < GC_BATCH) break;
    }
  }

  private async formulaRecompute(data: IBaseFormulaRecomputeJob, jobId: string) {
    await this.formula.backfill({
      pageId: data.pageId,
      workspaceId: data.workspaceId,
      formulaIds: data.propertyIds,
      actorId: data.actorId,
      rowIds: data.rowIds,
      jobId,
    });
  }

  private async typeConversion(data: IBaseTypeConversionJob) {
    const { pageId, propertyId, workspaceId, pendingToken } = data;
    const current = await this.propertyRepo.findById(pageId, propertyId);
    // gone, or restaged by a newer request: nothing to do
    if (!current || current.pendingToken !== pendingToken) return;

    const base = { pageId, workspaceId, actorId: data.actorId ?? null };
    try {
      // one transaction, so a failure leaves every cell on the old type
      const committed = await executeTx(this.db, async (trx) => {
        await this.conversion.convertAll({
          pageId,
          workspaceId,
          propertyId,
          from: { type: data.fromType, typeOptions: data.fromTypeOptions },
          to: { type: data.toType, typeOptions: data.toTypeOptions },
          clearMode: data.clearMode,
          trx,
        });
        const property = await this.propertyRepo.commitPendingConversion(
          pageId,
          propertyId,
          pendingToken,
          trx,
        );
        if (!property) throw new Error('stale');
        const schemaVersion = await this.propertyRepo.bumpSchemaVersion(
          pageId,
          trx,
        );
        return { property, schemaVersion };
      });

      emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_UPDATED, {
        ...base,
        property: committed.property,
      });
      emitBaseEvent(this.eventEmitter, EventName.BASE_SCHEMA_BUMPED, {
        ...base,
        schemaVersion: committed.schemaVersion,
      });

      const props = await this.propertyRepo.findByPageId(pageId);
      const dependents = new FormulaEvaluator(
        props.map(toEngineProperty),
      ).graph.affectedFormulas([propertyId]);
      if (dependents.length) {
        await this.formula.backfill({
          pageId,
          workspaceId,
          formulaIds: dependents,
          actorId: data.actorId,
          jobId: randomUUID(),
        });
      }
    } catch (err) {
      if ((err as Error).message === 'stale') return;
      await this.propertyRepo.clearPendingConversion(
        pageId,
        propertyId,
        pendingToken,
      );
      const property = await this.propertyRepo.findById(pageId, propertyId);
      if (property) {
        emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_UPDATED, {
          ...base,
          property,
        });
      }
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Base job ${job?.name} failed: ${err.message}`, err.stack);
  }
}
