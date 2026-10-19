import { Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import McpTokenList from "@/features/mcp/components/mcp-token-list";
import { useMcpServerInfoQuery } from "@/features/mcp/queries/mcp-token-query";

export default function McpTokens() {
  const { t } = useTranslation();
  const { data: info, isLoading } = useMcpServerInfoQuery();

  return (
    <>
      <DocumentTitle title={t("MCP")} />
      <SettingsTitle title={t("Model Context Protocol (MCP)")} />

      {!isLoading && !info?.enabled ? (
        <Alert color="gray">
          {t(
            "The MCP server is disabled. Set MCP_SERVER_ENABLED=true in the server environment to enable it.",
          )}
        </Alert>
      ) : (
        <McpTokenList />
      )}
    </>
  );
}
