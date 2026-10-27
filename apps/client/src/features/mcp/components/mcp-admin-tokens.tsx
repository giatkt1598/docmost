import { useState } from "react";
import { ActionIcon, Badge, Group, Skeleton, Space, Table, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate";
import { useTimeAgo } from "@/hooks/use-time-ago.tsx";
import {
  useAllMcpTokensQuery,
  useRevokeMcpTokenMutation,
} from "@/features/mcp/queries/mcp-token-query";
import { IMcpTokenWithOwner } from "@/features/mcp/types/mcp-token.types";

function LastUsed({ date }: { date: string | null }) {
  const { t } = useTranslation();
  const ago = useTimeAgo(date);
  return <>{date ? ago : t("Never")}</>;
}

// Every MCP token of the workspace, like API management for API keys.
export default function McpAdminTokens() {
  const { t, i18n } = useTranslation();
  const { cursor, goNext, goPrev } = useCursorPaginate();
  const { data, isLoading } = useAllMcpTokensQuery(cursor);
  const revoke = useRevokeMcpTokenMutation();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const tokens = data?.items ?? [];

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const confirmRevoke = (token: IMcpTokenWithOwner) =>
    modals.openConfirmModal({
      title: t("Revoke MCP token"),
      children: (
        <Text size="sm">
          {t(
            "Applications using {{name}} will immediately lose access. This cannot be undone.",
            { name: token.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setRevokingId(token.id);
        revoke.mutate(token.id, { onSettled: () => setRevokingId(null) });
      },
    });

  if (!isLoading && tokens.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="lg">
        {t("No MCP tokens yet")}
      </Text>
    );
  }

  return (
    <>
      <Table.ScrollContainer minWidth={560}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Name")}</Table.Th>
              <Table.Th>{t("User")}</Table.Th>
              <Table.Th>{t("Last used")}</Table.Th>
              <Table.Th>{t("Expires")}</Table.Th>
              <Table.Th>{t("Created")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading &&
              [1, 2, 3].map((i) => (
                <Table.Tr key={i}>
                  <Table.Td colSpan={6}>
                    <Skeleton height={14} radius="xs" />
                  </Table.Td>
                </Table.Tr>
              ))}
            {tokens.map((token) => {
              const expired =
                !!token.expiresAt &&
                new Date(token.expiresAt).getTime() < Date.now();
              return (
                <Table.Tr key={token.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {token.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <CustomAvatar
                        avatarUrl={token.owner?.avatarUrl}
                        name={token.owner?.name ?? ""}
                        size={24}
                      />
                      <Text size="sm" lineClamp={1}>
                        {token.owner?.name}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      <LastUsed date={token.lastUsedAt} />
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {expired ? (
                      <Badge color="red" variant="light">
                        {t("Expired")}
                      </Badge>
                    ) : (
                      <Text size="sm">
                        {token.expiresAt
                          ? formatDate(token.expiresAt)
                          : t("Never")}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(token.createdAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={t("Revoke")}
                        loading={revokingId === token.id}
                        onClick={() => confirmRevoke(token)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Space h="md" />
      {(data?.meta?.hasNextPage || data?.meta?.hasPrevPage) && (
        <Paginate
          hasPrevPage={data?.meta?.hasPrevPage}
          hasNextPage={data?.meta?.hasNextPage}
          onNext={() => goNext(data?.meta?.nextCursor)}
          onPrev={goPrev}
        />
      )}
    </>
  );
}
