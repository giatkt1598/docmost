import { useEffect, useMemo } from "react";
import { useAtomValue } from "jotai";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { basesApi } from "@/features/base/services/bases-api";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import { subscriptionManagerFor } from "@/features/base/utils/base-subscriptions";
import {
  applyBaseEvent,
  BaseEventDeps,
  FormulaJobs,
  recomputingPropertyIds,
} from "@/features/base/utils/base-event-handler";
import { isOwnRequestId } from "@/features/base/utils/request-id";

const REFETCH_DELAY_MS = 300;
const refetchTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Batches of rows:updated events arrive in bursts during a recompute; the
// lists are refetched once per burst.
function debouncedRefetch(qc: QueryClient) {
  return (pageId: string) => {
    const pending = refetchTimers.get(pageId);
    if (pending) clearTimeout(pending);
    refetchTimers.set(
      pageId,
      setTimeout(() => {
        refetchTimers.delete(pageId);
        qc.invalidateQueries({ queryKey: baseKeys.rowsRoot(pageId) });
      }, REFETCH_DELAY_MS),
    );
  };
}

// Keeps the caches of a base live while the component is mounted.
export function useBaseRealtime(pageId: string | undefined) {
  const socket = useAtomValue(socketAtom);
  const qc = useQueryClient();

  useEffect(() => {
    if (!socket || !pageId) return;
    const deps: BaseEventDeps = {
      isOwnRequest: isOwnRequestId,
      fetchRow: basesApi.rows.get,
      refetchRows: debouncedRefetch(qc),
    };
    return subscriptionManagerFor(socket).acquire(pageId, {
      onEvent: (event) => {
        void applyBaseEvent(qc, event, deps);
      },
      onReconnect: () => {
        qc.invalidateQueries({ queryKey: baseKeys.info(pageId) });
        qc.invalidateQueries({ queryKey: baseKeys.rowsRoot(pageId) });
      },
    });
  }, [socket, pageId, qc]);
}

// Formula properties of a base being recomputed in the background.
export function useRecomputingFormulas(pageId: string | undefined): Set<string> {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: baseKeys.formulaJobs(pageId ?? ""),
    queryFn: () =>
      qc.getQueryData<FormulaJobs>(baseKeys.formulaJobs(pageId ?? "")) ?? {},
    enabled: !!pageId,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return useMemo(() => recomputingPropertyIds(data), [data]);
}
