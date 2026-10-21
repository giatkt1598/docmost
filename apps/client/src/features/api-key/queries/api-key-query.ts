import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createApiKey,
  getApiKeys,
  renameApiKey,
  revokeApiKey,
} from "@/features/api-key/services/api-key-service";

export const API_KEYS_KEY = "user-api-keys";

export function useApiKeysQuery(params: {
  cursor?: string;
  adminView?: boolean;
}) {
  return useQuery({
    queryKey: [API_KEYS_KEY, params],
    queryFn: () => getApiKeys(params),
    placeholderData: keepPreviousData,
  });
}

function useApiKeyMutation<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  successMessage?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_KEYS_KEY] });
      if (successMessage) notifications.show({ message: successMessage });
    },
    onError: (error: any) =>
      notifications.show({
        message: error?.response?.data?.message ?? error?.message,
        color: "red",
      }),
  });
}

export const useCreateApiKeyMutation = () => useApiKeyMutation(createApiKey);

export function useRenameApiKeyMutation() {
  const { t } = useTranslation();
  return useApiKeyMutation(renameApiKey, t("Updated successfully"));
}

export function useRevokeApiKeyMutation() {
  const { t } = useTranslation();
  return useApiKeyMutation(revokeApiKey, t("API key revoked"));
}
