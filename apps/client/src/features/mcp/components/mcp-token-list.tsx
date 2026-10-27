import {
  ActionIcon,
  Button,
  Group,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/common/copy-button";
import { formattedDate } from "@/lib/time";
import {
  useMcpTokensQuery,
  useRevokeMcpTokenMutation,
} from "@/features/mcp/queries/mcp-token-query";
import CreateMcpTokenModal from "@/features/mcp/components/create-mcp-token-modal";
import { getMcpServerUrl } from "@/features/mcp/mcp.utils";
import { McpDocsButton } from "@/features/mcp/components/mcp-docs-button";

export default function McpTokenList() {
  const { t } = useTranslation();
  const { data: tokens, isLoading } = useMcpTokensQuery();
  const revokeMutation = useRevokeMcpTokenMutation();
  const [opened, { open, close }] = useDisclosure(false);
  const mcpUrl = getMcpServerUrl();

  return (
    <Stack>
      <div>
        <Text fw={500}>{t("MCP server URL")}</Text>
        <Text size="sm" c="dimmed" mb="xs">
          {t(
            "Connect AI assistants such as Claude Desktop or Cursor with this URL and a personal MCP token sent as a Bearer token.",
          )}
        </Text>
        <Group gap="xs" wrap="nowrap">
          <TextInput value={mcpUrl} readOnly style={{ flex: 1 }} />
          <CopyButton value={mcpUrl}>
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
      </div>

      <Group justify="space-between" mt="md">
        <Text fw={500}>{t("MCP tokens")}</Text>
        <Group gap="xs" wrap="nowrap">
          <McpDocsButton />
          <Button onClick={open}>{t("Create token")}</Button>
        </Group>
      </Group>

      <Table verticalSpacing="sm">
        <Table.Caption>
          <VisuallyHidden>{t("MCP tokens")}</VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Name")}</Table.Th>
            <Table.Th>{t("Created")}</Table.Th>
            <Table.Th>{t("Last used")}</Table.Th>
            <Table.Th>{t("Expires")}</Table.Th>
            <Table.Th>
              <VisuallyHidden>{t("Action")}</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading &&
            [1, 2].map((i) => (
              <Table.Tr key={i}>
                <Table.Td colSpan={5}>
                  <Skeleton height={14} radius="xs" />
                </Table.Td>
              </Table.Tr>
            ))}

          {!isLoading && tokens?.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text size="sm" c="dimmed">
                  {t("No MCP tokens yet")}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}

          {tokens?.map((token) => (
            <Table.Tr key={token.id}>
              <Table.Td>
                <Text size="sm">{token.name}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {formattedDate(new Date(token.createdAt))}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {token.lastUsedAt
                    ? formattedDate(new Date(token.lastUsedAt))
                    : t("Never")}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {token.expiresAt
                    ? formattedDate(new Date(token.expiresAt))
                    : t("Never")}
                </Text>
              </Table.Td>
              <Table.Td>
                <Button
                  variant="default"
                  size="xs"
                  loading={
                    revokeMutation.isPending &&
                    revokeMutation.variables === token.id
                  }
                  onClick={() => revokeMutation.mutate(token.id)}
                >
                  {t("Revoke")}
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <CreateMcpTokenModal opened={opened} onClose={close} />
    </Stack>
  );
}
