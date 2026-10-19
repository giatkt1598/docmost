import { ActionIcon, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconRosetteDiscountCheckFilled,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query";
import { usePageVerificationQuery } from "@/features/page-verification/queries/page-verification-query";
import { PageVerificationModal } from "@/features/page-verification/components/page-verification-modal";
import {
  formatVerificationDate,
  getVerificationColor,
  getVerificationLabel,
} from "@/features/page-verification/verification-status";

interface PageVerificationBadgeProps {
  readOnly?: boolean;
}

export function PageVerificationBadge({
  readOnly,
}: PageVerificationBadgeProps) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const pageId = page?.isBase ? undefined : page?.id;
  const { data: verification, isLoading } = usePageVerificationQuery(pageId);
  const [opened, { open, close }] = useDisclosure(false);

  if (!pageId || isLoading || !verification) return null;

  const { status } = verification;

  if (status === "none") {
    if (readOnly || !verification.permissions.canManage) return null;
    return (
      <>
        <Tooltip label={t("Set up verification")} withArrow openDelay={250}>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={open}
            aria-label={t("Set up verification")}
          >
            <IconShieldCheck size={20} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
        <PageVerificationModal
          pageId={pageId}
          opened={opened}
          onClose={close}
        />
      </>
    );
  }

  const color = getVerificationColor(status);
  const label = getVerificationLabel(status, t);
  const tooltip =
    status === "verified" && verification.expiresAt
      ? t("Verified until {{date}}", {
          date: formatVerificationDate(verification.expiresAt),
        })
      : label;

  return (
    <>
      <Tooltip label={tooltip} withArrow openDelay={250}>
        <UnstyledButton
          onClick={open}
          aria-label={tooltip}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <IconRosetteDiscountCheckFilled
            size={18}
            color={`var(--mantine-color-${color}-6)`}
            aria-hidden="true"
          />
          <Text size="sm" c={`${color}.7`}>
            {label}
          </Text>
        </UnstyledButton>
      </Tooltip>
      <PageVerificationModal pageId={pageId} opened={opened} onClose={close} />
    </>
  );
}
