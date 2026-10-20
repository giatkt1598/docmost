import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  createSsoProvider,
  deleteSsoProvider,
  getSsoProviders,
  updateSsoProvider,
} from "@/features/sso/services/sso-service";

export const SSO_PROVIDERS_KEY = ["core-sso-providers"];

function showError(error: any) {
  notifications.show({
    message: error?.response?.data?.message ?? error?.message,
    color: "red",
  });
}

export function useSsoProvidersQuery() {
  return useQuery({ queryKey: SSO_PROVIDERS_KEY, queryFn: getSsoProviders });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: SSO_PROVIDERS_KEY });
    // the login page reads enabled providers from the public workspace data
    queryClient.invalidateQueries({ queryKey: ["workspace-public"] });
  };
}

export function useCreateSsoProviderMutation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: createSsoProvider,
    onSuccess: invalidate,
    onError: showError,
  });
}

export function useUpdateSsoProviderMutation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: updateSsoProvider,
    onSuccess: invalidate,
    onError: showError,
  });
}

export function useDeleteSsoProviderMutation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: deleteSsoProvider,
    onSuccess: invalidate,
    onError: showError,
  });
}
