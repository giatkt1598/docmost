import { Text, Alert, Stack, List } from "@mantine/core";
import { modals } from "@mantine/modals";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useCallback, useState } from "react";
import { getAppName } from "@/lib/config";
import SettingsTitle from "@/components/settings/settings-title";
import IntegrationRow from "../components/integration-row";
import IntegrationListSkeleton from "../components/integration-list-skeleton";
import IntegrationSetupModal from "../components/integration-setup-modal";
import {
  useAvailableIntegrations,
  useIntegrationConfigs,
  useInstalledIntegrations,
  useUninstallIntegration,
} from "../queries/integration-query";
import { getOAuthInstallUrl } from "../services/integration-service";
import { notifications } from "@mantine/notifications";

export default function Integrations() {
  const { t } = useTranslation();
  const { data: available, isLoading: loadingAvailable } =
    useAvailableIntegrations();
  const { data: installed, isLoading: loadingInstalled } =
    useInstalledIntegrations();
  const { data: configs } = useIntegrationConfigs();
  const uninstallMutation = useUninstallIntegration();
  const [setupType, setSetupType] = useState<string | null>(null);
  const setupDefinition = available?.find((d) => d.type === setupType);

  const handleInstall = useCallback(
    async (type: string) => {
      try {
        const { authorizationUrl } = await getOAuthInstallUrl({ type });
        window.location.href = authorizationUrl;
      } catch (err: any) {
        notifications.show({
          message:
            err?.response?.data?.message ?? t("Failed to start installation"),
          color: "red",
        });
      }
    },
    [t],
  );

  const handleUninstall = useCallback(
    (integrationId: string) => {
      const installation = installed?.find((i) => i.id === integrationId);
      const name =
        available?.find((d) => d.type === installation?.type)?.name ??
        installation?.type ??
        "";
      modals.openConfirmModal({
        title: t("Uninstall {{name}}", { name }),
        centered: true,
        children: (
          <Text size="sm">
            {t(
              "This disables the {{name}} integration for the entire workspace. Members' connections are removed and links are not enriched.",
              { name },
            )}
          </Text>
        ),
        labels: { confirm: t("Uninstall"), cancel: t("Cancel") },
        confirmProps: { color: "red" },
        onConfirm: () => uninstallMutation.mutate({ integrationId }),
      });
    },
    [uninstallMutation, installed, available, t],
  );

  const isLoading = loadingAvailable || loadingInstalled;
  const error = new URLSearchParams(window.location.search).get("error");

  return (
    <>
      <Helmet>
        <title>
          {t("Integrations")} - {getAppName()}
        </title>
      </Helmet>

      <SettingsTitle title={t("Integrations")} />

      <Text size="sm" mb="xs">
        {t(
          "Integrations turn links from other apps into live previews. Paste a link to a pull request, issue or design into a page and it can show as a card with its current title, status and author.",
        )}
      </Text>
      <List type="ordered" size="sm" c="dimmed" spacing={2} mb="md">
        <List.Item>
          {t(
            "An admin creates an OAuth app in the other service and enters its details under Configure.",
          )}
        </List.Item>
        <List.Item>
          {t("An admin presses Install to enable it for this workspace.")}
        </List.Item>
        <List.Item>
          {t(
            "Each member connects their own account in Settings > Connections, so they only see what that account can open. Without it, only public items show a preview.",
          )}
        </List.Item>
      </List>

      {error === "oauth_failed" && (
        <Alert color="red" mb="md">
          {t("OAuth connection failed. Please try again.")}
        </Alert>
      )}

      {error === "tenant_in_use" && (
        <Alert color="red" mb="md">
          {t(
            "This Slack workspace is already connected to another Docmost workspace. Disconnect it there first, or install Docmost into a different Slack workspace.",
          )}
        </Alert>
      )}

      {isLoading ? (
        <IntegrationListSkeleton />
      ) : !available?.length ? (
        <Text c="dimmed" size="sm">
          {t("No integrations available.")}
        </Text>
      ) : (
        <Stack gap={0}>
          {available.map((def) => {
            const installation = installed?.find((i) => i.type === def.type);
            return (
              <IntegrationRow
                key={def.type}
                definition={def}
                installation={installation}
                configured={configs?.some(
                  (c) =>
                    c.type === def.type && !!c.clientId && c.hasClientSecret,
                ) ?? false}
                onConfigure={setSetupType}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
              />
            );
          })}
        </Stack>
      )}

      {setupDefinition && (
        <IntegrationSetupModal
          opened
          onClose={() => setSetupType(null)}
          definition={setupDefinition}
          config={configs?.find((c) => c.type === setupDefinition.type)}
          installation={installed?.find(
            (i) => i.type === setupDefinition.type,
          )}
        />
      )}
    </>
  );
}
