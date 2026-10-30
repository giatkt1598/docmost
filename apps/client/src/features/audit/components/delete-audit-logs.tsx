import { useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useDeleteAllAuditLogsMutation } from "@/features/audit/queries/audit-query";

const CONFIRMATION = "DELETE";

export function DeleteAuditLogs() {
  const { t } = useTranslation();
  const remove = useDeleteAllAuditLogsMutation();
  const [opened, setOpened] = useState(false);
  const [typed, setTyped] = useState("");

  const close = () => {
    setOpened(false);
    setTyped("");
  };

  const warning = t(
    "This permanently deletes every audit log in this workspace, including events not yet sent to SIEM. It cannot be undone.",
  );

  return (
    <>
      <Text fz="sm" c="dimmed" mb="md">
        {warning}
      </Text>
      <Button color="red" variant="light" onClick={() => setOpened(true)}>
        {t("Delete all audit logs")}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={t("Delete all audit logs")}
      >
        <Stack gap="sm">
          <Text fz="sm">{warning}</Text>
          <TextInput
            label={t("Type DELETE to confirm")}
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            autoComplete="off"
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button
              color="red"
              disabled={typed !== CONFIRMATION}
              loading={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: close })}
            >
              {t("Delete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
