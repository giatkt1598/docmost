import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { Page, User } from '@docmost/db/types/entity.types';
import { BaseViewRepo } from '@docmost/db/repos/base/base-view.repo';
import { EventName } from '../../common/events/event.contants';
import { emitBaseEvent } from './base.events';
import { guard } from './base.errors';
import { parseViewType, viewConfigSchema } from './engine/schema.zod';
import { CreateViewDto, DeleteViewDto, UpdateViewDto } from './dto/base.dto';

const MAX_VIEWS = 50;

@Injectable()
export class BaseViewService {
  constructor(
    private readonly viewRepo: BaseViewRepo,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private base(page: Page, user: User) {
    return { pageId: page.id, workspaceId: page.workspaceId, actorId: user.id };
  }

  list(page: Page) {
    return this.viewRepo.findByPageId(page.id);
  }

  async create(page: Page, dto: CreateViewDto, user: User) {
    return guard(async () => {
      if ((await this.viewRepo.countByPageId(page.id)) >= MAX_VIEWS) {
        throw new BadRequestException('Too many views');
      }
      const type = dto.type ? parseViewType(dto.type) : 'table';
      const config = viewConfigSchema.parse(dto.config ?? {});
      const last = await this.viewRepo.lastPosition(page.id);
      const view = await this.viewRepo.insert({
        pageId: page.id,
        workspaceId: page.workspaceId,
        creatorId: user.id,
        name: dto.name.trim(),
        type,
        position: generateJitteredKeyBetween(last, null),
        config: JSON.stringify(config),
      });
      emitBaseEvent(this.eventEmitter, EventName.BASE_VIEW_CREATED, {
        ...this.base(page, user),
        view,
      });
      return view;
    });
  }

  // `config` is a patch: a key set to null is removed from the stored config.
  async update(page: Page, dto: UpdateViewDto, user: User) {
    return guard(async () => {
      const existing = await this.viewRepo.findById(dto.viewId, page.id);
      if (!existing) throw new NotFoundException('View not found');

      const patch: Record<string, unknown> = {};
      const removals: string[] = [];
      for (const [k, v] of Object.entries(dto.config ?? {})) {
        if (v === null) removals.push(k);
        else patch[k] = v;
      }
      // validate the keys and shapes that are being set
      viewConfigSchema.partial().parse(patch);
      for (const k of removals) patch[k] = null;

      if (dto.position) {
        try {
          generateJitteredKeyBetween(dto.position, null);
        } catch {
          throw new BadRequestException('Invalid position');
        }
      }
      const view = await this.viewRepo.update(
        existing.id,
        page.id,
        {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.type ? { type: parseViewType(dto.type) } : {}),
          ...(dto.position ? { position: dto.position } : {}),
        },
        patch,
      );
      emitBaseEvent(this.eventEmitter, EventName.BASE_VIEW_UPDATED, {
        ...this.base(page, user),
        view,
      });
      return view;
    });
  }

  async delete(page: Page, dto: DeleteViewDto, user: User) {
    if ((await this.viewRepo.countByPageId(page.id)) <= 1) {
      throw new BadRequestException('A base needs at least one view');
    }
    const existing = await this.viewRepo.findById(dto.viewId, page.id);
    if (!existing) throw new NotFoundException('View not found');
    await this.viewRepo.delete(existing.id, page.id);
    emitBaseEvent(this.eventEmitter, EventName.BASE_VIEW_DELETED, {
      ...this.base(page, user),
      viewId: existing.id,
    });
  }
}
