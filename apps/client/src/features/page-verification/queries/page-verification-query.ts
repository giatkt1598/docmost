import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createPageVerification,
  deletePageVerification,
  getPageVerification,
  getPageVerifications,
  updatePageVerification,
  verifyPage,
} from "@/features/page-verification/services/page-verification-service";
import {
  IVerificationListParams,
  IVerificationSettings,
} from "@/features/page-verification/types/page-verification.types";

// same key the websocket "verificationUpdated" handler invalidates
export const PAGE_VERIFICATION_KEY = (pageId: string) => [
  "page-verification-info",
  pageId,
];
export const VERIFICATION_LIST_KEY = "verification-list";

export function usePageVerificationQuery(pageId?: string) {
  return useQuery({
    queryKey: PAGE_VERIFICATION_KEY(pageId ?? ""),
    queryFn: () => getPageVerification(pageId),
    enabled: !!pageId,
    staleTime: 60_000,
  });
}

export function useVerificationListQuery(params: IVerificationListParams) {
  return useQuery({
    queryKey: [VERIFICATION_LIST_KEY, params],
    queryFn: () => getPageVerifications(params),
    placeholderData: keepPreviousData,
  });
}

function useOnVerificationChange() {
  const queryClient = useQueryClient();
  return (pageId: string) => {
    queryClient.invalidateQueries({ queryKey: PAGE_VERIFICATION_KEY(pageId) });
    queryClient.invalidateQueries({ queryKey: [VERIFICATION_LIST_KEY] });
  };
}

function showError(error: any) {
  notifications.show({
    message: error?.response?.data?.message ?? error?.message,
    color: "red",
  });
}

export function useCreateVerificationMutation() {
  const onChange = useOnVerificationChange();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (data: IVerificationSettings & { pageId: string }) =>
      createPageVerification(data),
    onSuccess: (_data, variables) => {
      onChange(variables.pageId);
      notifications.show({ message: t("Verification set up") });
    },
    onError: showError,
  });
}

export function useUpdateVerificationMutation() {
  const onChange = useOnVerificationChange();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (data: Partial<IVerificationSettings> & { pageId: string }) =>
      updatePageVerification(data),
    onSuccess: (_data, variables) => {
      onChange(variables.pageId);
      notifications.show({ message: t("Verification updated") });
    },
    onError: showError,
  });
}

export function useDeleteVerificationMutation() {
  const onChange = useOnVerificationChange();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (pageId: string) => deletePageVerification(pageId),
    onSuccess: (_data, pageId) => {
      onChange(pageId);
      notifications.show({ message: t("Verification removed") });
    },
    onError: showError,
  });
}

export function useVerifyPageMutation() {
  const onChange = useOnVerificationChange();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (pageId: string) => verifyPage(pageId),
    onSuccess: (_data, pageId) => {
      onChange(pageId);
      notifications.show({ message: t("Page verified") });
    },
    onError: showError,
  });
}
