import { Menu } from "@mantine/core";
import { IconShieldCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { usePageVerificationQuery } from "@/features/page-verification/queries/page-verification-query";

interface PageVerificationMenuItemProps {
  pageId?: string;
  onClick: () => void;
}

export function PageVerificationMenuItem({
  pageId,
  onClick,
}: PageVerificationMenuItemProps) {
  const { t } = useTranslation();
  const { data: verification } = usePageVerificationQuery(pageId);

  if (!verification) return null;
  const isSetUp = verification.status !== "none";
  if (!isSetUp && !verification.permissions.canManage) return null;

  return (
    <Menu.Item leftSection={<IconShieldCheck size={16} />} onClick={onClick}>
      {isSetUp ? t("Page verification") : t("Set up verification")}
    </Menu.Item>
  );
}
