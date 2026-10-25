import { Paper, Stack, Text } from "@mantine/core";
import { IconLayoutKanban } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

// Board views get their own renderer in a later step.
export function KanbanPlaceholder() {
  const { t } = useTranslation();
  return (
    <Paper withBorder radius="md" p="xl" mt="xs">
      <Stack align="center" gap="xs">
        <IconLayoutKanban size={28} stroke={1.5} />
        <Text size="sm" c="dimmed">
          {t("Board views are coming soon.")}
        </Text>
      </Stack>
    </Paper>
  );
}
