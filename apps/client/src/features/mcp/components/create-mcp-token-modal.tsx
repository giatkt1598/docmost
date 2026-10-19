import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Code,
  Group,
  Modal,
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

interface Props {
  opened: boolean;
  onClose: () => void;
}

export default function CreateMcpTokenModal({ opened, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const createMutation = useCreateMcpTokenMutation();

  const handleClose = () => {
    setName("");
    setToken(null);
    onClose();
  };

  const handleCreate = async () => {
    const result = await createMutation.mutateAsync({ name: name.trim() });
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
