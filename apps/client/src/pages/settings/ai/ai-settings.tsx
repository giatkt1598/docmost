import { Alert, Code, List, Stack, Switch, Tabs, Text } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";
import { getAiStatus } from "@/features/ai/services/ai-service";

function AiProviderStatus() {
  const { t } = useTranslation();
  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: getAiStatus,
  });

  if (!status) return null;

  if (!status.configured) {
    return (
      <Alert
        variant="light"
        color="yellow"
        icon={<IconAlertTriangle size={18} />}
        title={t("No AI provider configured")}
      >
        <Text size="sm" mb="xs">
          {t(
            "Set these variables in the server .env file and restart the server, for example for Ollama:",
          )}
        </Text>
        <Code block>
          {[
            "AI_DRIVER=ollama",
            "OLLAMA_API_URL=http://localhost:11434",
            "AI_COMPLETION_MODEL=gemma4:e4b",
            "# AI_CHAT_MODEL=gemma4:e4b",
          ].join("\n")}
        </Code>
        <Text size="xs" c="dimmed" mt="xs">
          {t("Supported drivers: ollama, openai, openai-compatible, gemini.")}
        </Text>
      </Alert>
    );
  }

  return (
    <Alert
      variant="light"
      color="green"
      icon={<IconCircleCheck size={18} />}
      title={t("AI provider connected")}
    >
      <List size="sm" spacing={2}>
        <List.Item>
          {t("Driver")}: <Code>{status.driver}</Code>
        </List.Item>
        <List.Item>
          {t("Model")}: <Code>{status.completionModel}</Code>
          {status.chatModel && status.chatModel !== status.completionModel && (
            <>
              {" "}
              · {t("Chat")}: <Code>{status.chatModel}</Code>
            </>
          )}
        </List.Item>
      </List>
    </Alert>
  );
}

function GenerativeAiToggle() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();
  return (
    <SettingRow
      title={t("Generative AI (Ask AI)")}
      description={t(
        "Lets members improve, translate, summarize or continue text in the editor with AI.",
      )}
    >
      <Switch
        checked={workspace?.settings?.ai?.generative === true}
        disabled={saving}
        onChange={(e) => save({ generativeAi: e.currentTarget.checked })}
        aria-label={t("Toggle generative AI")}
      />
    </SettingRow>
  );
}

// /settings/ai: provider status and the AI features of the workspace.
export default function AiSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isMember } = useUserRole();

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
            <AiProviderStatus />
            <GenerativeAiToggle />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
