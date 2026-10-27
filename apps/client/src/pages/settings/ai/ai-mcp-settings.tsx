import { Alert, Divider, Tabs, Text } from "@mantine/core";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import McpAdminTokens from "@/features/mcp/components/mcp-admin-tokens";
import { RestrictMcpToAdmins } from "@/features/mcp/components/restrict-mcp-to-admins";
import { useMcpServerInfoQuery } from "@/features/mcp/queries/mcp-token-query";
import useUserRole from "@/hooks/use-user-role.tsx";

// Serves /settings/ai/mcp: the MCP tokens of every member, for admins. Each
// person's own tokens live under Account > MCP Server.
export default function AiMcpSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isMember } = useUserRole();
  const { data: info, isLoading } = useMcpServerInfoQuery();

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
          {!isLoading && !info?.enabled ? (
            <Alert color="gray">
              {t(
                "The MCP server is disabled. Set MCP_SERVER_ENABLED=true in the server environment to enable it.",
              )}
            </Alert>
          ) : (
            <>
              <RestrictMcpToAdmins />
              <Divider my="lg" />
              <Text size="sm" c="dimmed" mb="md">
                {t("MCP tokens of every member of the workspace.")}
              </Text>
              <McpAdminTokens />
            </>
          )}
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
