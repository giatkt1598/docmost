import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconDots } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { timeAgo } from "@/lib/time";
import {
  SIEM_TYPE_LABELS,
  SiemDestination,
} from "@/features/siem/types/siem.types";
import {
  useDeleteSiemDestinationMutation,
  useRetrySiemDestinationMutation,
  useSiemDestinationsQuery,
  useUpdateSiemDestinationMutation,
} from "@/features/siem/queries/siem-query";
import { SiemDestinationModal } from "@/features/siem/components/siem-destination-modal";

const MAX_DESTINATIONS = 2;

export function SiemDestinationList() {
  const { t } = useTranslation();
  const { data: destinations = [] } = useSiemDestinationsQuery();
  const update = useUpdateSiemDestinationMutation();
  const remove = useDeleteSiemDestinationMutation();
  const retry = useRetrySiemDestinationMutation();
  const [modalOpened, setModalOpened] = useState(false);
  const [editing, setEditing] = useState<SiemDestination | null>(null);

  const open = (destination: SiemDestination | null) => {
    setEditing(destination);
    setModalOpened(true);
  };

  const confirmDelete = (destination: SiemDestination) =>
    modals.openConfirmModal({
      title: t("Delete destination"),
      children: (
        <Text size="sm">
          {t("Events will stop being sent to {{name}}.", {
            name: destination.name,
          })}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => remove.mutate(destination.id),
    });

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text fz="sm" c="dimmed" style={{ flex: 1 }}>
          {t(
            "Stream audit events to your security tools as they happen. Credentials are stored encrypted.",
          )}
        </Text>
        <Button
          disabled={destinations.length >= MAX_DESTINATIONS}
          onClick={() => open(null)}
        >
          {t("Add destination")}
        </Button>
      </Group>

      <Stack gap="sm">
        {destinations.map((destination) => (
          <Card key={destination.id} withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={500}>{destination.name}</Text>
                  <Badge
                    size="sm"
                    variant="light"
                    color={destination.status === "failing" ? "red" : "green"}
                  >
                    {destination.status === "failing"
                      ? t("Failing")
                      : t("Healthy")}
                  </Badge>
                  {!destination.enabled && (
                    <Badge size="sm" variant="light" color="gray">
                      {t("Disabled")}
                    </Badge>
                  )}
                </Group>
                <Text fz="xs" c="dimmed">
                  {t(SIEM_TYPE_LABELS[destination.type])}
                  {destination.lastDeliveredAt &&
                    ` · ${t("Last delivery")}: ${timeAgo(new Date(destination.lastDeliveredAt))}`}
                </Text>
                {destination.lastError && (
                  <Text fz="xs" c="red" lineClamp={2}>
                    {destination.lastError}
                  </Text>
                )}
              </div>

              <Group gap="xs" wrap="nowrap">
                <Switch
                  checked={destination.enabled}
                  aria-label={t("Enabled")}
                  onChange={(e) =>
                    update.mutate({
                      destinationId: destination.id,
                      enabled: e.currentTarget.checked,
                    })
                  }
                />
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" aria-label={t("Actions")}>
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => open(destination)}>
                      {t("Edit")}
                    </Menu.Item>
                    {destination.lastError && (
                      <Menu.Item onClick={() => retry.mutate(destination.id)}>
                        {t("Retry now")}
                      </Menu.Item>
                    )}
                    <Menu.Item
                      color="red"
                      onClick={() => confirmDelete(destination)}
                    >
                      {t("Delete")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      <SiemDestinationModal
        opened={modalOpened}
        destination={editing}
        onClose={() => setModalOpened(false)}
      />
    </>
  );
}
