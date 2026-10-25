import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { jsonb } from '@docmost/db/repos/base/jsonb';
import { executeTx } from '@docmost/db/utils';
import { BaseProperty, Page, User } from '@docmost/db/types/entity.types';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { EventName } from '../../common/events/event.contants';
import { generateBasePropertyId } from '../../common/helpers/nanoid.utils';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  IBaseCellGcJob,
  IBaseFormulaRecomputeJob,
  IBaseTypeConversionJob,
} from '../../integrations/queue/constants/queue.interface';
import { emitBaseEvent, INLINE_ROW_THRESHOLD } from './base.events';
import { guard } from './base.errors';
import { BaseConversionService } from './base-conversion.service';
import { toEngineProperty } from './base-formula.service';
import {
  BASE_PROPERTY_TYPES,
  SYSTEM_PROPERTY_TYPES,
} from './engine/base.types';
import { compileFormula, FormulaEvaluator } from './engine/formula.engine';
import { normalizeTypeOptions } from './engine/schema.zod';
import { isConvertibleTarget } from './engine/type-conversion';
import {
  CreatePropertyDto,
  DeletePropertyDto,
  ReorderPropertyDto,
  UpdatePropertyDto,
} from './dto/base.dto';

const MAX_PROPERTIES = 200;

@Injectable()
export class BasePropertyService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.BASE_QUEUE) private readonly baseQueue: Queue,
    private readonly propertyRepo: BasePropertyRepo,
    private readonly rowRepo: BaseRowRepo,
    private readonly conversion: BaseConversionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private normalizeName(name: string, props: BaseProperty[], selfId?: string) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new BadRequestException('Property name is required');
    const key = trimmed.toLowerCase();
    if (props.some((p) => p.id !== selfId && p.name.trim().toLowerCase() === key)) {
      throw new BadRequestException('A property with this name already exists');
    }
    return trimmed;
  }

  private typeOptionsFor(
    type: string,
    input: any,
    props: BaseProperty[],
    selfId: string | null,
  ) {
    if (!(BASE_PROPERTY_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`Unknown property type "${type}"`);
    }
    if (type === 'formula') {
      return compileFormula(
        input?.source,
        props.map((p) => ({ ...toEngineProperty(p), name: p.name })),
        selfId,
        input?.formatOptions,
      );
    }
    return normalizeTypeOptions(type, input);
  }

  private enqueueRecompute(
    page: Page | { id: string; workspaceId: string },
    propertyIds: string[],
    reason: IBaseFormulaRecomputeJob['reason'],
    actorId?: string,
  ) {
    if (propertyIds.length === 0) return;
    const payload: IBaseFormulaRecomputeJob = {
      pageId: page.id,
      workspaceId: page.workspaceId,
      propertyIds,
      reason,
      actorId,
    };
    return this.baseQueue.add(QueueJob.BASE_FORMULA_RECOMPUTE, payload);
  }

  async create(page: Page, dto: CreatePropertyDto, user: User) {
    return guard(async () => {
      const props = await this.propertyRepo.findByPageId(page.id);
      if (props.length >= MAX_PROPERTIES) {
        throw new BadRequestException('Too many properties');
      }
      const name = this.normalizeName(dto.name, props);
      const typeOptions = this.typeOptionsFor(dto.type, dto.typeOptions, props, null);
      const last = await this.propertyRepo.lastPosition(page.id);

      const property = await this.propertyRepo.insert({
        id: generateBasePropertyId(),
        pageId: page.id,
        workspaceId: page.workspaceId,
        name,
        type: dto.type,
        typeOptions: jsonb(typeOptions),
        position: generateJitteredKeyBetween(last, null),
        isPrimary: false,
      });
      emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_CREATED, {
        pageId: page.id,
        workspaceId: page.workspaceId,
        actorId: user.id,
        requestId: dto.requestId,
        property,
      });
      if (dto.type === 'formula') {
        await this.enqueueRecompute(page, [property.id], 'formula_created', user.id);
      }
      return property;
    });
  }

  async delete(page: Page, dto: DeletePropertyDto, user: User) {
    return guard(async () => {
      const props = await this.propertyRepo.findByPageId(page.id);
      const prop = props.find((p) => p.id === dto.propertyId);
      if (!prop) throw new NotFoundException('Property not found');
      if (prop.isPrimary) {
        throw new BadRequestException('The primary property cannot be deleted');
      }
      const dependents = new FormulaEvaluator(
        props.map(toEngineProperty),
      ).graph.dependents(prop.id);

      await this.propertyRepo.softDelete(page.id, prop.id);
      emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_DELETED, {
        pageId: page.id,
        workspaceId: page.workspaceId,
        actorId: user.id,
        requestId: dto.requestId,
        propertyId: prop.id,
      });
      const gc: IBaseCellGcJob = {
        pageId: page.id,
        workspaceId: page.workspaceId,
        propertyId: prop.id,
      };
      await this.baseQueue.add(QueueJob.BASE_CELL_GC, gc);
      await this.enqueueRecompute(page, dependents, 'dep_deleted', user.id);
    });
  }

  async reorder(page: Page, dto: ReorderPropertyDto, user: User) {
    return guard(async () => {
      try {
        generateJitteredKeyBetween(dto.position, null);
      } catch {
        throw new BadRequestException('Invalid position');
      }
      const updated = await this.propertyRepo.update(page.id, dto.propertyId, {
        position: dto.position,
      });
      if (!updated) throw new NotFoundException('Property not found');
      emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_REORDERED, {
        pageId: page.id,
        workspaceId: page.workspaceId,
        actorId: user.id,
        requestId: dto.requestId,
        propertyId: dto.propertyId,
        position: dto.position,
      });
    });
  }

  async update(
    page: Page,
    dto: UpdatePropertyDto,
    user: User,
  ): Promise<{ property: BaseProperty; jobId: string | null }> {
    return guard(async () => {
      const props = await this.propertyRepo.findByPageId(page.id);
      const prop = props.find((p) => p.id === dto.propertyId);
      if (!prop) throw new NotFoundException('Property not found');
      if (prop.pendingToken) {
        throw new BadRequestException(
          'A type conversion is already in progress for this property',
        );
      }
      const name =
        dto.name !== undefined
          ? this.normalizeName(dto.name, props, prop.id)
          : prop.name;
      const newType = dto.type ?? prop.type;
      const base = {
        pageId: page.id,
        workspaceId: page.workspaceId,
        actorId: user.id,
        requestId: dto.requestId,
      };

      if (newType === prop.type) {
        return this.updateInPlace(page, prop, name, dto, base, user);
      }
      return this.changeType(page, props, prop, name, newType, dto, base, user);
    });
  }

  private async updateInPlace(
    page: Page,
    prop: BaseProperty,
    name: string,
    dto: UpdatePropertyDto,
    base: Record<string, unknown>,
    user: User,
  ) {
    const props = await this.propertyRepo.findByPageId(page.id);
    const patch: Record<string, unknown> = { name };
    let sourceChanged = false;
    if (dto.typeOptions !== undefined) {
      const opts = this.typeOptionsFor(prop.type, dto.typeOptions, props, prop.id);
      patch.typeOptions = jsonb(opts);
      sourceChanged =
        prop.type === 'formula' &&
        opts.source !== (prop.typeOptions as any)?.source;
    }
    const property = await this.propertyRepo.update(page.id, prop.id, patch);
    if (!property) throw new NotFoundException('Property not found');
    emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_UPDATED, {
      ...(base as any),
      property,
    });
    if (sourceChanged) {
      await this.enqueueRecompute(page, [prop.id], 'formula_edited', user.id);
    }
    return { property, jobId: null };
  }

  private async changeType(
    page: Page,
    props: BaseProperty[],
    prop: BaseProperty,
    name: string,
    newType: string,
    dto: UpdatePropertyDto,
    base: Record<string, unknown>,
    user: User,
  ) {
    if (!isConvertibleTarget(newType)) {
      throw new BadRequestException(`Cannot convert a property to ${newType}`);
    }
    if (prop.isPrimary && newType !== 'text' && newType !== 'longText') {
      throw new BadRequestException('The primary property must stay text');
    }
    const toOptions = this.typeOptionsFor(newType, dto.typeOptions ?? {}, props, prop.id);
    const from = { type: prop.type, typeOptions: prop.typeOptions as any };
    const to = { type: newType, typeOptions: toOptions };
    // system properties keep no cells, so there is nothing to rewrite
    const clearMode = SYSTEM_PROPERTY_TYPES.has(prop.type);
    const dependents = new FormulaEvaluator(
      props.map(toEngineProperty),
    ).graph.affectedFormulas([prop.id]);
    const rowCount = clearMode ? 0 : await this.rowRepo.count(page.id);

    if (clearMode || rowCount <= INLINE_ROW_THRESHOLD) {
      const { property, version } = await executeTx(this.db, async (trx) => {
        if (!clearMode) {
          await this.conversion.convertAll({
            pageId: page.id,
            workspaceId: page.workspaceId,
            propertyId: prop.id,
            from,
            to,
            clearMode: false,
            trx,
          });
        }
        const updated = await this.propertyRepo.update(
          page.id,
          prop.id,
          { name, type: newType, typeOptions: jsonb(toOptions) },
          trx,
        );
        const v = await this.propertyRepo.bumpSchemaVersion(page.id, trx);
        return { property: updated, version: v };
      });
      emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_UPDATED, {
        ...(base as any),
        property,
      });
      emitBaseEvent(this.eventEmitter, EventName.BASE_SCHEMA_BUMPED, {
        ...(base as any),
        schemaVersion: version,
      });
      await this.enqueueRecompute(page, dependents, 'dep_type_changed', user.id);
      return { property, jobId: null };
    }

    // Large base: stage the new type and let the worker rewrite the cells.
    const pendingToken = randomUUID();
    const property = await this.propertyRepo.update(page.id, prop.id, {
      name,
      pendingType: newType,
      pendingTypeOptions: jsonb(toOptions),
      pendingToken,
    });
    const payload: IBaseTypeConversionJob = {
      pageId: page.id,
      propertyId: prop.id,
      workspaceId: page.workspaceId,
      fromType: prop.type,
      toType: newType,
      fromTypeOptions: prop.typeOptions,
      toTypeOptions: toOptions,
      clearMode: false,
      pendingToken,
      actorId: user.id,
    };
    const job = await this.baseQueue.add(QueueJob.BASE_TYPE_CONVERSION, payload);
    emitBaseEvent(this.eventEmitter, EventName.BASE_PROPERTY_UPDATED, {
      ...(base as any),
      property,
    });
    return { property, jobId: String(job.id) };
  }
}
