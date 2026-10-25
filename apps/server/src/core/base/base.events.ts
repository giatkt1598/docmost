import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventName } from '../../common/events/event.contants';

// Payloads carry what the client needs for the socket event plus the
// workspace and actor, which the realtime service uses for access checks.
export type BaseEventPayload = {
  pageId: string;
  workspaceId: string;
  actorId?: string | null;
  requestId?: string | null;
  [key: string]: unknown;
};

// Server event -> socket event name the client listens to.
export const BASE_SOCKET_EVENTS: Partial<Record<EventName, string>> = {
  [EventName.BASE_ROW_CREATED]: 'base:row:created',
  [EventName.BASE_ROW_UPDATED]: 'base:row:updated',
  [EventName.BASE_ROW_DELETED]: 'base:row:deleted',
  [EventName.BASE_ROWS_DELETED]: 'base:rows:deleted',
  [EventName.BASE_ROW_REORDERED]: 'base:row:reordered',
  [EventName.BASE_ROWS_UPDATED]: 'base:rows:updated',
  [EventName.BASE_PROPERTY_CREATED]: 'base:property:created',
  [EventName.BASE_PROPERTY_UPDATED]: 'base:property:updated',
  [EventName.BASE_PROPERTY_DELETED]: 'base:property:deleted',
  [EventName.BASE_PROPERTY_REORDERED]: 'base:property:reordered',
  [EventName.BASE_VIEW_CREATED]: 'base:view:created',
  [EventName.BASE_VIEW_UPDATED]: 'base:view:updated',
  [EventName.BASE_VIEW_DELETED]: 'base:view:deleted',
  [EventName.BASE_SCHEMA_BUMPED]: 'base:schema:bumped',
  [EventName.BASE_FORMULA_RECOMPUTE_STARTED]: 'base:formula:recompute:started',
  [EventName.BASE_FORMULA_RECOMPUTE_COMPLETED]:
    'base:formula:recompute:completed',
};

export function emitBaseEvent(
  emitter: EventEmitter2,
  name: EventName,
  payload: BaseEventPayload,
): void {
  emitter.emit(name, payload);
}

export const FORMULA_BATCH_SIZE = 500;
// Bases up to this many rows are converted / backfilled inside the request.
export const INLINE_ROW_THRESHOLD = 1000;
export const MAX_ROWS_PER_BASE = 100_000;
// Deleted rows can be restored for this long, then they are purged.
export const ROW_RETENTION_DAYS = 30;
