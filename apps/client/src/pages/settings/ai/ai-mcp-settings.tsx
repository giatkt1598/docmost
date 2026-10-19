import { Tabs } from "@mantine/core";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import McpServerSection from "@/features/mcp/components/mcp-server-section";
import useUserRole from "@/hooks/use-user-role.tsx";

// Serves /settings/ai/mcp; the AI tab links back to the AI settings page.
export default function AiMcpSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isMember } = useUserRole();

  if (isMember) {
    return <Navigate to="/settings/account/mcp" replace />;
  }

  const handleTabChange = (value: string | null) => {
    if (value === "ai") {
      navigate("/settings/ai");
    }
  };

  return (
    <>
      <DocumentTitle title="AI settings" />
      <SettingsTitle title={t("AI settings")} />

      <Tabs color="dark" value="mcp" onChange={handleTabChange}>
        <Tabs.List>
          <Tabs.Tab fw={500} value="ai">
            {t("AI")}
          </Tabs.Tab>
          <Tabs.Tab fw={500} value="mcp">
            {t("MCP")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="mcp" pt="md">
          <McpServerSection />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
