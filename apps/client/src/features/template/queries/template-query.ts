import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createPageFromTemplate,
  createTemplate,
  deleteTemplate,
  getTemplateById,
  getTemplates,
  updateTemplate,
} from "@/features/template/services/template-service";
import {
  ICreateTemplate,
  ITemplate,
  IUpdateTemplate,
} from "@/features/template/types/template.types";

export const TEMPLATES_KEY = "page-templates";
export const TEMPLATE_KEY = (templateId: string) => [
  "page-template",
  templateId,
];

function showError(error: any) {
  notifications.show({
    message: error?.response?.data?.message ?? error?.message,
    color: "red",
  });
}

export function useTemplatesQuery(params: {
  spaceId?: string;
  query?: string;
}) {
  return useInfiniteQuery({
    queryKey: [TEMPLATES_KEY, params],
    queryFn: ({ pageParam }) =>
      getTemplates({ ...params, cursor: pageParam, limit: 24 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
  });
}

export function useTemplateQuery(templateId?: string) {
  return useQuery({
    queryKey: TEMPLATE_KEY(templateId ?? ""),
    queryFn: () => getTemplateById(templateId),
    enabled: !!templateId,
  });
}

export function useCreateTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ICreateTemplate) => createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
    },
    onError: showError,
  });
}

export function useUpdateTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IUpdateTemplate) => updateTemplate(data),
    onSuccess: (template: ITemplate) => {
      queryClient.setQueryData(TEMPLATE_KEY(template.id), template);
      queryClient.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
    },
    onError: showError,
  });
}

export function useDeleteTemplateMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (templateId: string) => deleteTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
      notifications.show({ message: t("Template deleted") });
    },
    onError: showError,
  });
}

export function useCreatePageFromTemplateMutation() {
  return useMutation({
    mutationFn: (data: {
      templateId: string;
      spaceId: string;
      parentPageId?: string;
    }) => createPageFromTemplate(data),
    onError: showError,
  });
}
