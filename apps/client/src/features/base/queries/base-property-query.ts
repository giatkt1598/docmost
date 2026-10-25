import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { basesApi } from "@/features/base/services/bases-api";
import {
  Base,
  NewPropertyFields,
  PropertyChanges,
} from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import {
  patchPropertyInBase,
  removePropertyFromBase,
  updateBaseInfo,
  upsertPropertyInBase,
} from "@/features/base/utils/info-cache";
import { createRequestId } from "@/features/base/utils/request-id";
import { notifyBaseError } from "@/features/base/utils/errors";

type Saved = { before?: Base };

// Applies a change to the base info right away and keeps the previous value
// for a rollback.
export function optimisticInfo<TVars>(
  qc: QueryClient,
  pageId: string,
  change: (base: Base, vars: TVars) => Base,
) {
  return async (vars: TVars): Promise<Saved> => {
    const key = baseKeys.info(pageId);
    await qc.cancelQueries({ queryKey: key });
    const before = qc.getQueryData<Base>(key);
    updateBaseInfo(qc, pageId, (b) => change(b, vars));
    return { before };
  };
}

export function rollbackInfo(qc: QueryClient, pageId: string, message: string) {
  return (e: unknown, _vars: unknown, saved?: Saved) => {
    if (saved?.before) qc.setQueryData(baseKeys.info(pageId), saved.before);
    notifyBaseError(e, message);
  };
}

export function useCreatePropertyMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (fields: NewPropertyFields) =>
      basesApi.properties.create(pageId, fields, createRequestId()),
    onSuccess: (property) =>
      updateBaseInfo(qc, pageId, (b) => upsertPropertyInBase(b, property)),
    onError: (e) => notifyBaseError(e, t("Failed to create property")),
  });
}

type PropertyEdit = PropertyChanges & { propertyId: string };

export function useUpdatePropertyMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ propertyId, ...changes }: PropertyEdit) =>
      basesApi.properties.update(pageId, propertyId, changes, createRequestId()),
    onMutate: optimisticInfo(qc, pageId, (base, edit: PropertyEdit) => {
      const current = base.properties.find((p) => p.id === edit.propertyId);
      // a type change converts cells on the server: wait for it
      if (!current || (edit.type && edit.type !== current.type)) return base;
      const shown: Record<string, unknown> = {};
      if (edit.name !== undefined) shown.name = edit.name;
      // formula options are compiled by the server
      if (edit.typeOptions !== undefined && current.type !== "formula") {
        shown.typeOptions = edit.typeOptions;
      }
      return patchPropertyInBase(base, edit.propertyId, shown);
    }),
    onSuccess: ({ property }, edit: PropertyEdit, saved?: Saved) => {
      updateBaseInfo(qc, pageId, (b) => upsertPropertyInBase(b, property));
      const old = saved?.before?.properties.find((p) => p.id === property.id);
      if (edit.type && old && old.type !== property.type) {
        // converted inside the request: cells changed
        void qc.invalidateQueries({ queryKey: baseKeys.rowsRoot(pageId) });
      }
    },
    onError: rollbackInfo(qc, pageId, t("Failed to update property")),
  });
}

export function useDeletePropertyMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (propertyId: string) =>
      basesApi.properties.remove(pageId, propertyId, createRequestId()),
    onMutate: optimisticInfo(qc, pageId, (base, propertyId: string) =>
      removePropertyFromBase(base, propertyId),
    ),
    onError: rollbackInfo(qc, pageId, t("Failed to delete property")),
  });
}

type PropertyMove = { propertyId: string; position: string };

export function useReorderPropertyMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (m: PropertyMove) =>
      basesApi.properties.reorder(pageId, m.propertyId, m.position, createRequestId()),
    onMutate: optimisticInfo(qc, pageId, (base, m: PropertyMove) =>
      patchPropertyInBase(base, m.propertyId, { position: m.position }),
    ),
    onError: rollbackInfo(qc, pageId, t("Failed to move property")),
  });
}
