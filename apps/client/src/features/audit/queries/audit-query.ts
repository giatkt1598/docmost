import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  deleteAllAuditLogs,
  getAuditLogs,
  getAuditRetention,
  saveAuditRetention,
} from "@/features/audit/services/audit-service";
import { AuditLogQuery } from "@/features/audit/types/audit.types";

export const AUDIT_LOGS_KEY = "audit-logs";
const AUDIT_RETENTION_KEY = "audit-retention";

export function useAuditLogsQuery(query: AuditLogQuery) {
  return useQuery({
    queryKey: [AUDIT_LOGS_KEY, query],
    queryFn: () => getAuditLogs(query),
    placeholderData: keepPreviousData,
    // new events arrive all the time: opt out of the app-wide cache defaults
    staleTime: 0,
    refetchOnMount: true,
  });
}

export function useAuditRetentionQuery() {
  return useQuery({
    queryKey: [AUDIT_RETENTION_KEY],
    queryFn: getAuditRetention,
  });
}

export function useDeleteAllAuditLogsMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAllAuditLogs,
    onSuccess: ({ deleted }) => {
      queryClient.invalidateQueries({ queryKey: [AUDIT_LOGS_KEY] });
      notifications.show({
        message: t("Deleted {{count}} audit logs", { count: deleted }),
      });
    },
    onError: (error: any) => {
      notifications.show({
        message: error?.response?.data?.message ?? t("Something went wrong"),
        color: "red",
      });
    },
  });
}

export function useSaveAuditRetentionMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveAuditRetention,
    onSuccess: (data) => {
      queryClient.setQueryData([AUDIT_RETENTION_KEY], data);
      notifications.show({ message: t("Audit retention updated") });
    },
    onError: (error: any) => {
      notifications.show({
        message: error?.response?.data?.message ?? t("Something went wrong"),
        color: "red",
      });
    },
  });
}
