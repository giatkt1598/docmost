import { Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import McpTokenList from "@/features/mcp/components/mcp-token-list";
import useUserRole from "@/hooks/use-user-role.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useAtomValue } from "jotai";
import { useMcpServerInfoQuery } from "@/features/mcp/queries/mcp-token-query";

export default function McpServerSection() {
  const { t } = useTranslation();
  const { data: info, isLoading } = useMcpServerInfoQuery();
  const { isAdmin } = useUserRole();
  const workspace = useAtomValue(workspaceAtom);

  if (!isLoading && !info?.enabled) {
    return (
      <Alert color="gray">
        {t(
          "The MCP server is disabled. Set MCP_SERVER_ENABLED=true in the server environment to enable it.",
        )}
      </Alert>
    );
  }

  if (workspace?.settings?.mcp?.restrictToAdmins === true && !isAdmin) {
    return (
      <Alert color="gray">
        {t(
          "MCP access is restricted to workspace admins. Ask an admin if you need it.",
        )}
      </Alert>
    );
  }

  return <McpTokenList />;
}
