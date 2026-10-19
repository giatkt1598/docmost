import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import McpServerSection from "@/features/mcp/components/mcp-server-section";
import useUserRole from "@/hooks/use-user-role.tsx";

export default function McpTokens() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  // admins manage MCP from AI settings
  if (isAdmin) {
    return <Navigate to="/settings/ai/mcp" replace />;
  }

  return (
    <>
      <DocumentTitle title={t("MCP")} />
      <SettingsTitle title={t("Model Context Protocol (MCP)")} />
      <McpServerSection />
    </>
  );
}
