import { Button } from "@mantine/core";
import { IconBook } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function McpDocsButton() {
  const { t } = useTranslation();
  return (
    <Button
      component={Link}
      to="/settings/account/mcp/docs"
      variant="default"
      leftSection={<IconBook size={16} />}
      style={{ flexShrink: 0 }}
    >
      {t("MCP documentation")}
    </Button>
  );
}
