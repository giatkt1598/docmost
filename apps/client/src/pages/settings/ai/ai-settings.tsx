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

function GenerativeAiToggle({ providerReady }: { providerReady: boolean }) {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();
  return (
    <SettingRow
      title={t("Generative AI (Ask AI)")}
      description={
        providerReady
          ? t(
              "Lets members improve, translate, summarize or continue text in the editor with AI.",
            )
          : t("Configure an AI provider first.")
      }
    >
      <Switch
        checked={workspace?.settings?.ai?.generative === true}
        disabled={saving || !providerReady}
        onChange={(e) => save({ generativeAi: e.currentTarget.checked })}
        aria-label={t("Toggle generative AI")}
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
            <GenerativeAiToggle providerReady={!!provider?.configured} />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
