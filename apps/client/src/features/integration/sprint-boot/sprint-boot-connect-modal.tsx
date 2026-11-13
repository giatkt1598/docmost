import { useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { startSprintBootLink } from "./sprint-boot-service";

// Enter the Sprint Boot address and authorize there; both sides exchange what they need between their servers.
export function SprintBootConnectModal({
  opened,
  onClose,
  initialUrl,
}: {
  opened: boolean;
  onClose: () => void;
  initialUrl?: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const authorize = async () => {
    setPending(true);
    setFailure(null);
    try {
      const { authorizeUrl } = await startSprintBootLink(url.trim());
      window.location.assign(authorizeUrl);
    } catch (err: any) {
      setFailure(err?.response?.data?.message ?? t("Could not reach Sprint Boot"));
      setPending(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Connect Sprint Boot")} centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t(
            "Enter your Sprint Boot address. You will authorize the link in Sprint Boot and pick the spaces to connect, then come back here.",
          )}
        </Text>
        <TextInput
          label={t("Sprint Boot address")}
          placeholder="https://sprint-boot.example.com"
          value={url}
          onChange={(event) => setUrl(event.currentTarget.value)}
          data-autofocus
        />
        {failure && (
          <Text c="red" size="sm">
            {failure}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button loading={pending} disabled={!/^https?:\/\/\S+$/i.test(url.trim())} onClick={authorize}>
            {t("Authorize")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
