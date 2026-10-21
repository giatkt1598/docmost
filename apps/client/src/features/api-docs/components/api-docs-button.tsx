import { Button } from "@mantine/core";
import { IconBook } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function ApiDocsButton() {
  const { t } = useTranslation();
  return (
    <Button
      component={Link}
      to="/settings/api-docs"
      variant="default"
      leftSection={<IconBook size={16} />}
      style={{ flexShrink: 0 }}
    >
      {t("API documentation")}
    </Button>
  );
}
