import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCircleCheck, IconCircleCheckFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface ResolveCommentButtonProps {
  isResolved: boolean;
  loading?: boolean;
  onToggle: () => void;
}

export default function ResolveCommentButton({
  isResolved,
  loading,
  onToggle,
}: ResolveCommentButtonProps) {
  const { t } = useTranslation();
  const label = isResolved ? t("Re-open comment") : t("Resolve comment");

  return (
    <Tooltip label={label} position="top">
      <ActionIcon
        variant="subtle"
        color={isResolved ? "green" : "gray"}
        size="sm"
        onClick={onToggle}
        loading={loading}
        disabled={loading}
        aria-label={label}
      >
        {isResolved ? (
          <IconCircleCheckFilled size={18} />
        ) : (
          <IconCircleCheck size={18} />
        )}
      </ActionIcon>
    </Tooltip>
  );
}
