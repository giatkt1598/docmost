import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import * as integrationService from "../services/integration-service";

export function useAvailableIntegrations() {
  return useQuery({
    queryKey: ["available-integrations"],
    queryFn: integrationService.getAvailableIntegrations,
  });
}

export function useInstalledIntegrations(enabled = true) {
  return useQuery({
    queryKey: ["installed-integrations"],
    queryFn: integrationService.getInstalledIntegrations,
    enabled,
  });
}

export function useUninstallIntegration() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: integrationService.uninstallIntegration,
    onSuccess: () => {
      notifications.show({
        message: t("Integration uninstalled successfully"),
      });
      qc.invalidateQueries({ queryKey: ["installed-integrations"] });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to uninstall integration"),
        color: "red",
      });
    },
  });
}

export function useIntegrationConfigs() {
  return useQuery({
    queryKey: ["integration-configs"],
    queryFn: integrationService.getIntegrationConfigs,
  });
}

export function useSaveIntegrationConfig() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: integrationService.saveIntegrationConfig,
    onSuccess: () => {
      notifications.show({ message: t("Integration settings saved") });
      qc.invalidateQueries({ queryKey: ["integration-configs"] });
      qc.invalidateQueries({ queryKey: ["installed-integrations"] });
      qc.invalidateQueries({ queryKey: ["my-connections"] });
      // A new server or app can drop connections, so cached cards are stale.
      qc.removeQueries({ queryKey: ["unfurl"] });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to save integration settings"),
        color: "red",
      });
    },
  });
}

export function useMyConnections() {
  return useQuery({
    queryKey: ["my-connections"],
    queryFn: integrationService.getMyConnections,
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: integrationService.disconnectIntegration,
    onSuccess: () => {
      notifications.show({ message: t("Integration disconnected") });
      qc.invalidateQueries({ queryKey: ["my-connections"] });
      // refetchOnMount is false, so invalidated inactive queries would stay stale.
      qc.removeQueries({ queryKey: ["unfurl"] });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to disconnect integration"),
        color: "red",
      });
    },
  });
}
