import { useMemo } from "react";
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { basesApi } from "@/features/base/services/bases-api";
import {
  BaseRow,
  NewRowFields,
  RowChanges,
  RowFilter,
  RowQuery,
} from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import {
  defaultInsertPolicy,
  flattenRows,
  InsertPolicy,
  mergeReferences,
  moveRow,
  patchRowCells,
  removeRows,
  restoreRowsSnapshot,
  RowsSnapshot,
  snapshotRows,
  upsertRows,
} from "@/features/base/utils/row-cache";
import { createRequestId } from "@/features/base/utils/request-id";
import { notifyBaseError } from "@/features/base/utils/errors";

// Rows of a base for one (filter, sorts, search), 100 per page.
export function useBaseRowsQuery(
  pageId: string | undefined,
  query: RowQuery = {},
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: baseKeys.rows(pageId ?? "", query),
    enabled: Boolean(pageId) && enabled,
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      basesApi.rows.list(pageId as string, query, pageParam),
    getNextPageParam: ({ meta }) =>
      meta.hasNextPage && meta.nextCursor ? meta.nextCursor : undefined,
  });
}

// The rows query plus its rows (one entry per id) and merged references.
export function useBaseRows(
  pageId: string | undefined,
  query: RowQuery = {},
  options: { enabled?: boolean } = {},
) {
  const result = useBaseRowsQuery(pageId, query, options);
  const { data } = result;
  const rows = useMemo(() => flattenRows(data), [data]);
  const references = useMemo(() => mergeReferences(data?.pages ?? []), [data]);
  return { ...result, rows, references };
}

export const useBaseRowQuery = (pageId?: string, rowId?: string) =>
  useQuery({
    queryKey: baseKeys.row(pageId ?? "", rowId ?? ""),
    enabled: Boolean(pageId && rowId),
    queryFn: () => basesApi.rows.get(pageId as string, rowId as string),
  });

// ---- writes ---------------------------------------------------------------

// Optimistic row writes: apply locally, roll back to the snapshot on error.
function optimisticRows<TVars>(
  qc: QueryClient,
  pageId: string,
  apply: (vars: TVars) => void,
) {
  return async (vars: TVars): Promise<{ snapshot: RowsSnapshot }> => {
    await qc.cancelQueries({ queryKey: baseKeys.rowsRoot(pageId) });
    const snapshot = snapshotRows(qc, pageId);
    apply(vars);
    return { snapshot };
  };
}

function rollbackRows(qc: QueryClient, message: string) {
  return (e: unknown, _vars: unknown, ctx?: { snapshot: RowsSnapshot }) => {
    if (ctx) restoreRowsSnapshot(qc, ctx.snapshot);
    notifyBaseError(e, message);
  };
}

export type CreateRowArgs = NewRowFields & {
  // which cached lists take the new row (default: unfiltered ones)
  insert?: InsertPolicy;
};

export function useCreateRowMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ insert: _ignored, ...fields }: CreateRowArgs) =>
      basesApi.rows.create(pageId, fields, createRequestId()),
    onSuccess: (row: BaseRow, args) =>
      upsertRows(qc, pageId, [row], args.insert ?? defaultInsertPolicy),
    onError: (e) => notifyBaseError(e, t("Failed to create row")),
  });
}

export function useUpdateRowMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ rowId, ...changes }: RowChanges & { rowId: string }) =>
      basesApi.rows.update(pageId, rowId, changes, createRequestId()),
    onMutate: optimisticRows(qc, pageId, (v: RowChanges & { rowId: string }) => {
      if (v.cells && Object.keys(v.cells).length > 0) {
        patchRowCells(qc, pageId, v.rowId, v.cells);
      }
      if (v.position) moveRow(qc, pageId, v.rowId, v.position);
    }),
    // the server row carries recomputed formulas
    onSuccess: (row) => upsertRows(qc, pageId, [row]),
    onError: rollbackRows(qc, t("Failed to update row")),
  });
}

export function useReorderRowMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (v: { rowId: string; position: string }) =>
      basesApi.rows.reorder(pageId, v.rowId, v.position, createRequestId()),
    onMutate: optimisticRows(qc, pageId, (v: { rowId: string; position: string }) =>
      moveRow(qc, pageId, v.rowId, v.position),
    ),
    onError: rollbackRows(qc, t("Failed to move row")),
  });
}

export function useDeleteRowMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (rowId: string) =>
      basesApi.rows.remove(pageId, rowId, createRequestId()),
    onMutate: optimisticRows(qc, pageId, (rowId: string) =>
      removeRows(qc, pageId, [rowId]),
    ),
    onError: rollbackRows(qc, t("Failed to delete row")),
  });
}

export function useDeleteRowsMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (rowIds: string[]) =>
      basesApi.rows.removeMany(pageId, rowIds, createRequestId()),
    onMutate: optimisticRows(qc, pageId, (rowIds: string[]) =>
      removeRows(qc, pageId, rowIds),
    ),
    onError: rollbackRows(qc, t("Failed to delete rows")),
  });
}

export function useRestoreRowsMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (rowIds: string[]) =>
      basesApi.rows.restore(pageId, rowIds, createRequestId()),
    onSuccess: ({ items }) => upsertRows(qc, pageId, items),
    onError: (e) => notifyBaseError(e, t("Failed to restore rows")),
  });
}

export function useOpenRowPageMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (rowId: string) => basesApi.rows.openPage(pageId, rowId),
    onSuccess: (page, rowId) => {
      // a first open links the row to its new page
      if (page.created) {
        void qc.invalidateQueries({ queryKey: baseKeys.row(pageId, rowId) });
      }
    },
    onError: (e) => notifyBaseError(e, t("Failed to open the row page")),
  });
}

export function useImportCsvMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (v: { file: File; createMissing: boolean }) =>
      basesApi.base.importCsv(pageId, v.file, v.createMissing),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: baseKeys.info(pageId) });
      void qc.invalidateQueries({ queryKey: baseKeys.rowsRoot(pageId) });
    },
    onError: (e) => notifyBaseError(e, t("Failed to import CSV")),
  });
}

export function useExportCsvMutation(pageId: string) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (filter?: RowFilter) => basesApi.base.exportCsv(pageId, filter),
    onError: (e) => notifyBaseError(e, t("Failed to export CSV")),
  });
}
