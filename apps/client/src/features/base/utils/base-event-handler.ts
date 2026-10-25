import { QueryClient } from "@tanstack/react-query";
import {
  BaseRealtimeEvent,
  Base,
  BaseRow,
} from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import {
  getCachedRow,
  moveRow,
  patchRowCells,
  removeRows,
  upsertRows,
} from "@/features/base/utils/row-cache";
import {
  patchPropertyInBase,
  removePropertyFromBase,
  removeViewFromBase,
  updateBaseInfo,
  upsertPropertyInBase,
  upsertViewInBase,
} from "@/features/base/utils/info-cache";

// Applies one realtime event to the query cache. Every branch is idempotent
// by id, so duplicated or replayed events do no harm.
//
// Echoes of our own row writes are dropped: the mutation already applied
// them, and a late echo could overwrite a newer optimistic edit. Schema and
// view events are applied even when they are ours, because one request can
// cause several of them (a rename also rewrites formulas, for instance).

export type FormulaJobs = Record<string, string[]>;

export type BaseEventDeps = {
  isOwnRequest: (requestId: string | null | undefined) => boolean;
  fetchRow: (pageId: string, rowId: string) => Promise<BaseRow>;
  // refetch every row list of the base (callers debounce it)
  refetchRows: (pageId: string) => void;
};

// Above this many changed rows in view, refetching the lists is cheaper
// than fetching the rows one by one.
export const MAX_ROWS_FETCHED_ONE_BY_ONE = 20;

const ROW_EVENTS = new Set<string>([
  "base:row:created",
  "base:row:updated",
  "base:row:deleted",
  "base:rows:deleted",
  "base:row:reordered",
]);

function invalidateAll(qc: QueryClient, pageId: string) {
  qc.invalidateQueries({ queryKey: baseKeys.info(pageId) });
  qc.invalidateQueries({ queryKey: baseKeys.rowsRoot(pageId) });
}

async function refreshRows(
  qc: QueryClient,
  pageId: string,
  rowIds: string[],
  deps: BaseEventDeps,
) {
  const cached = rowIds.filter((id) => getCachedRow(qc, pageId, id));
  if (cached.length === 0) return;
  if (cached.length > MAX_ROWS_FETCHED_ONE_BY_ONE) {
    deps.refetchRows(pageId);
    return;
  }
  await Promise.all(
    cached.map(async (id) => {
      try {
        upsertRows(qc, pageId, [await deps.fetchRow(pageId, id)]);
      } catch (e: any) {
        if (e?.response?.status === 404) removeRows(qc, pageId, [id]);
      }
    }),
  );
}

function setFormulaJobs(
  qc: QueryClient,
  pageId: string,
  fn: (jobs: FormulaJobs) => FormulaJobs,
) {
  const key = baseKeys.formulaJobs(pageId);
  qc.setQueryData<FormulaJobs>(key, fn(qc.getQueryData<FormulaJobs>(key) ?? {}));
}

export function applyBaseEvent(
  qc: QueryClient,
  event: BaseRealtimeEvent,
  deps: BaseEventDeps,
): Promise<void> | void {
  const { pageId } = event;
  if (!pageId) return;
  if (ROW_EVENTS.has(event.operation) && deps.isOwnRequest(event.requestId)) {
    return;
  }

  switch (event.operation) {
    case "base:subscribed": {
      const base = qc.getQueryData<Base>(baseKeys.info(pageId));
      if (base && base.baseSchemaVersion !== event.schemaVersion) {
        invalidateAll(qc, pageId);
      }
      return;
    }
    case "base:schema:bumped": {
      const base = qc.getQueryData<Base>(baseKeys.info(pageId));
      if (base && base.baseSchemaVersion >= event.schemaVersion) return;
      updateBaseInfo(qc, pageId, (b) => ({
        ...b,
        baseSchemaVersion: event.schemaVersion,
      }));
      invalidateAll(qc, pageId);
      return;
    }

    case "base:row:created":
      upsertRows(qc, pageId, [event.row]);
      return;
    case "base:row:updated":
      patchRowCells(qc, pageId, event.rowId, event.updatedCells ?? {});
      return;
    case "base:row:deleted":
      removeRows(qc, pageId, [event.rowId]);
      return;
    case "base:rows:deleted":
      removeRows(qc, pageId, event.rowIds ?? []);
      return;
    case "base:row:reordered":
      moveRow(qc, pageId, event.rowId, event.position);
      return;
    case "base:rows:updated":
      return refreshRows(qc, pageId, event.rowIds ?? [], deps);

    case "base:property:created":
    case "base:property:updated":
      updateBaseInfo(qc, pageId, (b) => upsertPropertyInBase(b, event.property));
      return;
    case "base:property:deleted":
      updateBaseInfo(qc, pageId, (b) => removePropertyFromBase(b, event.propertyId));
      return;
    case "base:property:reordered":
      updateBaseInfo(qc, pageId, (b) =>
        patchPropertyInBase(b, event.propertyId, { position: event.position }),
      );
      return;

    case "base:view:created":
    case "base:view:updated":
      updateBaseInfo(qc, pageId, (b) => upsertViewInBase(b, event.view));
      return;
    case "base:view:deleted":
      updateBaseInfo(qc, pageId, (b) => removeViewFromBase(b, event.viewId));
      return;

    case "base:formula:recompute:started":
      setFormulaJobs(qc, pageId, (jobs) => ({
        ...jobs,
        [event.jobId]: event.propertyIds ?? [],
      }));
      return;
    case "base:formula:recompute:completed":
      setFormulaJobs(qc, pageId, (jobs) => {
        const { [event.jobId]: _done, ...rest } = jobs;
        return rest;
      });
      return;
  }
}

// Formula properties that are being recomputed right now.
export function recomputingPropertyIds(jobs: FormulaJobs | undefined): Set<string> {
  return new Set(Object.values(jobs ?? {}).flat());
}
