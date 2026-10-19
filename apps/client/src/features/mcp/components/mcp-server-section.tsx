import { Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import McpTokenList from "@/features/mcp/components/mcp-token-list";
import { useMcpServerInfoQuery } from "@/features/mcp/queries/mcp-token-query";

export default function McpServerSection() {
  const { t } = useTranslation();
  const { data: info, isLoading } = useMcpServerInfoQuery();

  if (!isLoading && !info?.enabled) {
    return (
      <Alert color="gray">
        {t(
          "The MCP server is disabled. Set MCP_SERVER_ENABLED=true in the server environment to enable it.",
        )}
      </Alert>
    );
  }

  return <McpTokenList />;
}
