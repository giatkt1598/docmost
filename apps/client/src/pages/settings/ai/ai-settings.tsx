import { Stack, Switch, Tabs, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";
import {
  AI_PROVIDER_KEY,
  AiProviderForm,
} from "@/features/ai/components/ai-provider-form";
import { getAiProvider } from "@/features/ai/services/ai-provider-service";

// One AI feature switch; locked until a provider is configured.
function AiFeatureToggle({
  providerReady,
  title,
  description,
  setting,
  field,
  ariaLabel,
}: {
  providerReady: boolean;
  title: string;
  description: string;
  setting: "generative" | "search";
  field: "generativeAi" | "aiSearch";
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();
  return (
    <SettingRow
      title={title}
      description={
        providerReady ? description : t("Configure an AI provider first.")
      }
    >
      <Switch
        checked={workspace?.settings?.ai?.[setting] === true}
        disabled={saving || !providerReady}
        onChange={(e) => save({ [field]: e.currentTarget.checked })}
        aria-label={ariaLabel}
      />
    </SettingRow>
  );
}

// /settings/ai: the AI provider of the workspace and its AI features.
export default function AiSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isMember } = useUserRole();
  const { data: provider } = useQuery({
    queryKey: AI_PROVIDER_KEY,
    queryFn: getAiProvider,
    enabled: !isMember,
  });

  if (isMember) return <Navigate to="/settings/account/profile" replace />;

  return (
    <>
      <DocumentTitle title={t("AI settings")} />
      <SettingsTitle title={t("AI settings")} />

      <Tabs
        color="dark"
        value="ai"
        onChange={(value) => value === "mcp" && navigate("/settings/ai/mcp")}
      >
        <Tabs.List>
          <Tabs.Tab fw={500} value="ai">
            {t("AI")}
          </Tabs.Tab>
          <Tabs.Tab fw={500} value="mcp">
            {t("MCP")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="ai" pt="md">
          <Stack gap="lg">
            <AiProviderForm />
            <Title order={5}>{t("Features")}</Title>
            <AiFeatureToggle
              providerReady={!!provider?.configured}
              title={t("Generative AI (Ask AI)")}
              description={t(
                "Lets members improve, translate, summarize or continue text in the editor with AI.",
              )}
              setting="generative"
              field="generativeAi"
              ariaLabel={t("Toggle generative AI")}
            />
            <AiFeatureToggle
              providerReady={!!provider?.configured}
              title={t("AI search (AI answers)")}
              description={t(
                "Lets members ask questions in search and get an answer from the pages they can access, with links to the sources.",
              )}
              setting="search"
              field="aiSearch"
              ariaLabel={t("Toggle AI search")}
            />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
