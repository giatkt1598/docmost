import { Button, Group, Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

type Props = {
  canSave: boolean;
  saving: boolean;
  onReset: () => void;
  onSave: () => void;
};

// Shown while the viewer's filter / sort differ from the saved view.
export function DraftBanner({ canSave, saving, onReset, onSave }: Props) {
  const { t } = useTranslation();
  return (
    <Paper withBorder radius="sm" px="sm" py={6} my={6}>
      <Group justify="space-between" gap="xs">
        <Text size="sm" c="dimmed">
          {canSave
            ? t("Your filter and sort changes are only visible to you.")
            : t("Your filter and sort changes are only visible to you and are not saved to the view.")}
        </Text>
        <Group gap={6}>
          <Button size="compact-xs" variant="default" onClick={onReset}>
            {t("Reset")}
          </Button>
          {canSave && (
            <Button size="compact-xs" onClick={onSave} loading={saving}>
              {t("Save for everyone")}
            </Button>
          )}
        </Group>
      </Group>
    </Paper>
  );
}
