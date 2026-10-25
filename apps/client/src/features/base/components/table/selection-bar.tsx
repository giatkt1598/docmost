import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconTrash, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type Props = {
  count: number;
  onDelete: () => void;
  onClear: () => void;
  deleting: boolean;
};

export function SelectionBar({ count, onDelete, onClear, deleting }: Props) {
  const { t } = useTranslation();
  return (
    <Group gap="xs" py={4}>
      <Text size="sm" fw={500}>
        {t("{{count}} selected", { count })}
      </Text>
      <Button size="compact-xs" color="red" variant="light" leftSection={<IconTrash size={12} />}
        onClick={onDelete} loading={deleting}>
        {t("Delete")}
      </Button>
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconX size={12} />}
        onClick={onClear}>
        {t("Clear selection")}
      </Button>
    </Group>
  );
}

// "N rows deleted" toast with an Undo button (rows/restore).
export function showUndoToast(t: TFunction, count: number, onUndo: () => void) {
  const id = `base-undo-${Date.now()}`;
  notifications.show({
    id,
    autoClose: 8000,
    message: (
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Text size="sm">{t("{{count}} rows deleted", { count })}</Text>
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => {
            notifications.hide(id);
            onUndo();
          }}
        >
          {t("Undo")}
        </Button>
      </Group>
    ),
  });
}
