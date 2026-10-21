import { ActionIcon, Badge, Group, Menu, Table, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { useTimeAgo } from "@/hooks/use-time-ago.tsx";
import { IApiKey } from "@/features/api-key/types/api-key.types";
import { useRevokeApiKeyMutation } from "@/features/api-key/queries/api-key-query";

interface ApiKeyTableProps {
  apiKeys: IApiKey[];
  isLoading?: boolean;
  showCreator?: boolean;
  onRename: (apiKey: IApiKey) => void;
}

function LastUsed({ date }: { date: string | null }) {
  const { t } = useTranslation();
  const ago = useTimeAgo(date);
  return <>{date ? ago : t("Never")}</>;
}

export function ApiKeyTable({
  apiKeys,
  isLoading,
  showCreator,
  onRename,
}: ApiKeyTableProps) {
  const { t, i18n } = useTranslation();
  const revoke = useRevokeApiKeyMutation();

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const confirmRevoke = (apiKey: IApiKey) =>
    modals.openConfirmModal({
      title: t("Revoke API key"),
      children: (
        <Text size="sm">
          {t(
            "Applications using {{name}} will immediately lose access. This cannot be undone.",
            { name: apiKey.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => revoke.mutate(apiKey.id),
    });

  if (!isLoading && apiKeys.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="lg">
        {t("No API keys yet")}
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Name")}</Table.Th>
            {showCreator && <Table.Th>{t("User")}</Table.Th>}
            <Table.Th>{t("Last used")}</Table.Th>
            <Table.Th>{t("Expires")}</Table.Th>
            <Table.Th>{t("Created")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {apiKeys.map((apiKey) => {
            const expired =
              !!apiKey.expiresAt &&
              new Date(apiKey.expiresAt).getTime() < Date.now();
            return (
              <Table.Tr key={apiKey.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {apiKey.name}
                  </Text>
                </Table.Td>
                {showCreator && (
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <CustomAvatar
                        avatarUrl={apiKey.creator?.avatarUrl}
                        name={apiKey.creator?.name ?? ""}
                        size={24}
                      />
                      <Text size="sm" lineClamp={1}>
                        {apiKey.creator?.name}
                      </Text>
                    </Group>
                  </Table.Td>
                )}
                <Table.Td>
                  <Text size="sm">
                    <LastUsed date={apiKey.lastUsedAt} />
                  </Text>
                </Table.Td>
                <Table.Td>
                  {expired ? (
                    <Badge color="red" variant="light">
                      {t("Expired")}
                    </Badge>
                  ) : (
                    <Text size="sm">
                      {apiKey.expiresAt
                        ? formatDate(apiKey.expiresAt)
                        : t("Never")}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDate(apiKey.createdAt)}</Text>
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={t("API key actions")}
                        >
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconPencil size={16} />}
                          onClick={() => onRename(apiKey)}
                        >
                          {t("Rename")}
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          onClick={() => confirmRevoke(apiKey)}
                        >
                          {t("Revoke")}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
