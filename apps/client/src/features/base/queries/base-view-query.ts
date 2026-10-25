import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { basesApi } from "@/features/base/services/bases-api";
import { NewViewFields, ViewChanges } from "@/features/base/types/base.types";
import {
  patchViewInBase,
  removeViewFromBase,
  updateBaseInfo,
  upsertViewInBase,
} from "@/features/base/utils/info-cache";
import { notifyBaseError } from "@/features/base/utils/errors";
import {
  optimisticInfo,
  rollbackInfo,
} from "@/features/base/queries/base-property-query";

export function useCreateViewMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (fields: NewViewFields) => basesApi.views.create(pageId, fields),
    onSuccess: (view) => updateBaseInfo(qc, pageId, (b) => upsertViewInBase(b, view)),
    onError: (e) => notifyBaseError(e, t("Failed to create view")),
  });
}

type ViewEdit = ViewChanges & { viewId: string };

// The config part is a patch: null keys are removed (here and on the server).
export function useUpdateViewMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ viewId, ...changes }: ViewEdit) =>
      basesApi.views.update(pageId, viewId, changes),
    onMutate: optimisticInfo(qc, pageId, (base, { viewId, ...changes }: ViewEdit) =>
      patchViewInBase(base, viewId, changes),
    ),
    onSuccess: (view) => updateBaseInfo(qc, pageId, (b) => upsertViewInBase(b, view)),
    onError: rollbackInfo(qc, pageId, t("Failed to update view")),
  });
}

export function useDeleteViewMutation(pageId: string) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (viewId: string) => basesApi.views.remove(pageId, viewId),
    onMutate: optimisticInfo(qc, pageId, (base, viewId: string) =>
      removeViewFromBase(base, viewId),
    ),
    onError: rollbackInfo(qc, pageId, t("Failed to delete view")),
  });
}
