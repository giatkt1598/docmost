import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createSiemDestination,
  deleteSiemDestination,
  getSiemDestinations,
  retrySiemDestination,
  testSiemDestination,
  updateSiemDestination,
} from "@/features/siem/services/siem-service";

const SIEM_DESTINATIONS_KEY = "siem-destinations";

export function useSiemDestinationsQuery() {
  return useQuery({
    queryKey: [SIEM_DESTINATIONS_KEY],
    queryFn: getSiemDestinations,
    // delivery state changes in the background
    refetchInterval: 30 * 1000,
    staleTime: 0,
    refetchOnMount: true,
  });
}

function useSiemMutation<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SIEM_DESTINATIONS_KEY] });
    },
    onError: (error: any) => {
      notifications.show({
        message: error?.response?.data?.message ?? t("Something went wrong"),
        color: "red",
      });
    },
  });
}

export const useCreateSiemDestinationMutation = () =>
  useSiemMutation(createSiemDestination);
export const useUpdateSiemDestinationMutation = () =>
  useSiemMutation(updateSiemDestination);
export const useDeleteSiemDestinationMutation = () =>
  useSiemMutation(deleteSiemDestination);
export const useRetrySiemDestinationMutation = () =>
  useSiemMutation(retrySiemDestination);
export const useTestSiemDestinationMutation = () =>
  useSiemMutation(testSiemDestination);
