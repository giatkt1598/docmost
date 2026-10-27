import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Code,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/common/copy-button";
import { useCreateMcpTokenMutation } from "@/features/mcp/queries/mcp-token-query";
import { getMcpServerUrl } from "@/features/mcp/mcp.utils";

const DAY_MS = 24 * 60 * 60 * 1000;

interface Props {
  opened: boolean;
  onClose: () => void;
}

export default function CreateMcpTokenModal({ opened, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [token, setToken] = useState<string | null>(null);
  const createMutation = useCreateMcpTokenMutation();

  const handleClose = () => {
    setName("");
    setExpiry("90");
    setToken(null);
    onClose();
  };

  const handleCreate = async () => {
    const result = await createMutation.mutateAsync({
      name: name.trim(),
      expiresAt:
        expiry === "never"
          ? undefined
          : new Date(Date.now() + Number(expiry) * DAY_MS).toISOString(),
    });
    setToken(result.token);
  };

  const exampleConfig = token
    ? JSON.stringify(
        {
          mcpServers: {
            docmost: {
              url: getMcpServerUrl(),
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={token ? t("Token created") : t("Create MCP token")}
      size="lg"
    >
      {!token ? (
        <Stack>
          <TextInput
            label={t("Name")}
            placeholder={t("e.g. Claude Desktop")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={100}
            data-autofocus
          />
          <Select
            label={t("Expiration")}
            description={t(
              "A token acts as you, with your permissions. Short-lived tokens are safer.",
            )}
            value={expiry}
            onChange={(value) => setExpiry(value ?? "90")}
            allowDeselect={false}
            data={[
              { value: "7", label: t("7 days") },
              { value: "30", label: t("30 days") },
              { value: "90", label: t("90 days") },
              { value: "365", label: t("1 year") },
              { value: "never", label: t("Never") },
            ]}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              {t("Cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim()}
              loading={createMutation.isPending}
            >
              {t("Create")}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Alert color="yellow">
            {t("Copy this token now. You won't be able to see it again.")}
          </Alert>
          <Group gap="xs" wrap="nowrap">
            <TextInput value={token} readOnly style={{ flex: 1 }} />
            <CopyButton value={token}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t("Copied") : t("Copy")} withArrow>
                  <ActionIcon
                    variant="subtle"
                    color={copied ? "teal" : "gray"}
                    onClick={copy}
                    aria-label={t("Copy")}
                  >
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>

          <Text size="sm" c="dimmed">
            {t("Example configuration for MCP clients:")}
          </Text>
          <Code block>{exampleConfig}</Code>

          <Group justify="flex-end">
            <Button onClick={handleClose}>{t("Done")}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
