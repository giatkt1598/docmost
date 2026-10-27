import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import McpServerSection from "@/features/mcp/components/mcp-server-section";

export default function McpTokens() {
  const { t } = useTranslation();

  return (
    <>
      <DocumentTitle title={t("MCP Server")} />
      <SettingsTitle title={t("MCP Server")} />
      <McpServerSection />
    </>
  );
}
