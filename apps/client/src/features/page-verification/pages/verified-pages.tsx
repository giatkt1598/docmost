import { useEffect, useState } from "react";
import {
  Avatar,
  Badge,
  Group,
  SegmentedControl,
  Select,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import Paginate from "@/components/common/paginate.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate.tsx";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { useVerificationListQuery } from "@/features/page-verification/queries/page-verification-query";
import {
  formatVerificationDate,
  getVerificationColor,
  getVerificationLabel,
} from "@/features/page-verification/verification-status";

export default function VerifiedPages() {
  const { t } = useTranslation();
  const currentUser = useAtomValue(currentUserAtom);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 400);
  const { cursor, goNext, goPrev, resetCursor } = useCursorPaginate();
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });

  useEffect(() => {
    resetCursor();
  }, [spaceId, scope, debouncedSearch, resetCursor]);

  const { data, isLoading } = useVerificationListQuery({
    spaceId: spaceId ?? undefined,
    verifierId: scope === "mine" ? currentUser?.user?.id : undefined,
    query: debouncedSearch || undefined,
    cursor,
    limit: 20,
  });

  return (
    <>
      <DocumentTitle title={t("Verified pages")} />
      <SettingsTitle title={t("Verified pages")} />

      <Group mb="md" gap="sm" wrap="wrap">
        <TextInput
          placeholder={t("Search by page title")}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <Select
          placeholder={t("All spaces")}
          clearable
          value={spaceId}
          onChange={(value) => setSpaceId(value ? String(value) : null)}
          data={(spaces?.items ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          w={200}
        />
        <SegmentedControl
          value={scope}
          onChange={(value) => setScope(value as "all" | "mine")}
          data={[
            { value: "all", label: t("All") },
            { value: "mine", label: t("I'm a verifier") },
          ]}
        />
      </Group>

      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Page")}</Table.Th>
              <Table.Th>{t("Status")}</Table.Th>
              <Table.Th>{t("Expires")}</Table.Th>
              <Table.Th>{t("Verifiers")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {!isLoading && data?.items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="dimmed">
                    {t("No verified pages")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}

            {data?.items.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Text
                    component={Link}
                    to={buildPageUrl(
                      item.spaceSlug,
                      item.pageSlugId,
                      item.pageTitle ?? undefined,
                    )}
                    size="sm"
                    fw={500}
                    lineClamp={1}
                  >
                    {item.pageIcon ? `${item.pageIcon} ` : ""}
                    {item.pageTitle || t("Untitled")}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {item.spaceName}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={getVerificationColor(item.status)}
                    variant="light"
                  >
                    {getVerificationLabel(item.status, t)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {item.expiresAt
                      ? formatVerificationDate(item.expiresAt)
                      : t("Never")}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Avatar.Group>
                    {item.verifiers.map((v) => (
                      <Tooltip key={v.id} label={v.name} withArrow>
                        <CustomAvatar
                          avatarUrl={v.avatarUrl}
                          name={v.name}
                          size={28}
                        />
                      </Tooltip>
                    ))}
                  </Avatar.Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Paginate
        hasPrevPage={data?.meta?.hasPrevPage}
        hasNextPage={data?.meta?.hasNextPage}
        onNext={() => goNext(data?.meta?.nextCursor)}
        onPrev={goPrev}
      />
    </>
  );
}
