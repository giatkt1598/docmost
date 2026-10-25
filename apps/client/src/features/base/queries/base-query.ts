import {
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { basesApi } from "@/features/base/services/bases-api";
import {
  Base,
  BaseChanges,
  BaseProperty,
  BaseView,
  NewBaseFields,
  SeedTemplate,
} from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import { sortByPosition } from "@/features/base/utils/position";
import { notifyBaseError } from "@/features/base/utils/errors";

// Shared definition of the base info query; properties and views are read
// from it through `select`, so they have a single cache entry.
export const baseInfoOptions = (pageId: string | undefined) =>
  queryOptions({
    queryKey: baseKeys.info(pageId ?? ""),
    queryFn: () => basesApi.base.info(pageId as string),
    enabled: Boolean(pageId),
    staleTime: 60_000,
  });

export const useBaseInfoQuery = (pageId: string | undefined) =>
  useQuery(baseInfoOptions(pageId));

const propertiesInOrder = (base: Base): BaseProperty[] =>
  sortByPosition(base.properties);
const viewsInOrder = (base: Base): BaseView[] => sortByPosition(base.views);

export const useBaseProperties = (pageId: string | undefined) =>
  useQuery({ ...baseInfoOptions(pageId), select: propertiesInOrder });

export const useBaseViews = (pageId: string | undefined) =>
  useQuery({ ...baseInfoOptions(pageId), select: viewsInOrder });

export function useBasesListQuery(spaceId: string | undefined) {
  return useInfiniteQuery({
    queryKey: baseKeys.list(spaceId ?? ""),
    enabled: Boolean(spaceId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => basesApi.base.list(spaceId as string, pageParam),
    getNextPageParam: ({ meta }) =>
      meta.hasNextPage && meta.nextCursor ? meta.nextCursor : undefined,
  });
}

export function useCreateBaseMutation() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (fields: NewBaseFields) => basesApi.base.create(fields),
    onSuccess: (base) => {
      qc.setQueryData(baseKeys.info(base.id), base);
      void qc.invalidateQueries({ queryKey: baseKeys.list(base.spaceId) });
    },
    onError: (e) => notifyBaseError(e, t("Failed to create base")),
  });
}

export function useConvertToBaseMutation() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (args: { pageId: string; template?: SeedTemplate }) =>
      basesApi.base.convert(args.pageId, args.template),
    onSuccess: (base) => {
      qc.setQueryData(baseKeys.info(base.id), base);
      // the page record now has isBase set
      for (const id of [base.id, base.slugId]) {
        void qc.invalidateQueries({ queryKey: ["pages", id] });
      }
    },
    onError: (e) => notifyBaseError(e, t("Failed to create base")),
  });
}

export function useUpdateBaseMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const key = baseKeys.info(pageId);
  return useMutation({
    mutationFn: (changes: BaseChanges) => basesApi.base.update(pageId, changes),
    onMutate: async (changes) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Base>(key);
      if (before) {
        const shown = Object.fromEntries(
          Object.entries(changes).filter(([, v]) => v !== undefined),
        );
        qc.setQueryData<Base>(key, { ...before, ...shown });
      }
      return { before };
    },
    onSuccess: (base) => qc.setQueryData(key, base),
    onError: (e, _changes, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
      notifyBaseError(e, t("Failed to update base"));
    },
  });
}

export function useDeleteBaseMutation(pageId: string, spaceId?: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => basesApi.base.remove(pageId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: baseKeys.info(pageId) });
      qc.removeQueries({ queryKey: baseKeys.rowsRoot(pageId) });
      if (spaceId) void qc.invalidateQueries({ queryKey: baseKeys.list(spaceId) });
    },
    onError: (e) => notifyBaseError(e, t("Failed to delete base")),
  });
}
