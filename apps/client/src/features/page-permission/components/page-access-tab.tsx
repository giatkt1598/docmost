import { useState } from "react";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconLock, IconShieldLock, IconUsers } from "@tabler/icons-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MultiMemberSelect } from "@/features/space/components/multi-member-select";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import {
  useAddPagePermissionsMutation,
  usePageRestrictionInfoQuery,
  useRestrictPageMutation,
  useUnrestrictPageMutation,
} from "@/features/page-permission/queries/page-permission-query";
import { PagePermissionList } from "@/features/page-permission/components/page-permission-list";
import { PagePermissionRole } from "@/features/page-permission/types/page-permission.types";

interface PageAccessTabProps {
  pageId: string | undefined;
}

export function PageAccessTab({ pageId }: PageAccessTabProps) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { data: info, isLoading } = usePageRestrictionInfoQuery(pageId);
  const restrict = useRestrictPageMutation();
  const unrestrict = useUnrestrictPageMutation();
  const add = useAddPagePermissionsMutation();
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [role, setRole] = useState<PagePermissionRole>("writer");

  if (isLoading || !info || !pageId) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  const canManage = info.userAccess.canManage;
  const restricted = info.hasDirectRestriction;

  const onAccessChange = (value: string | null) => {
    if (value === "restricted" && !restricted) restrict.mutate({ pageId });
    if (value === "open" && restricted) unrestrict.mutate({ pageId });
  };

  const onAdd = async () => {
    const userIds = memberIds
      .filter((id) => id.startsWith("user-"))
      .map((id) => id.slice("user-".length));
    const groupIds = memberIds
      .filter((id) => id.startsWith("group-"))
      .map((id) => id.slice("group-".length));
    await add.mutateAsync({ pageId, role, userIds, groupIds });
    setMemberIds([]);
  };

  return (
    <Stack gap="md">
      {info.hasInheritedRestriction && info.inheritedFrom && (
        <Alert
          variant="light"
          color="orange"
          icon={<IconShieldLock size={18} />}
          title={t("Inherited restriction")}
        >
          <Text size="xs">
            {t("Access is also limited by")}{" "}
            <Anchor
              component={Link}
              size="xs"
              fw={500}
              to={buildPageUrl(
                spaceSlug,
                info.inheritedFrom.slugId,
                info.inheritedFrom.title,
              )}
            >
              {info.inheritedFrom.title || t("Untitled")}
            </Anchor>
          </Text>
        </Alert>
      )}

      <Box>
        <Select
          label={t("General access")}
          data={[
            { value: "open", label: t("Everyone in this space") },
            { value: "restricted", label: t("Only people with access") },
          ]}
          value={restricted ? "restricted" : "open"}
          onChange={onAccessChange}
          disabled={!canManage || restrict.isPending || unrestrict.isPending}
          allowDeselect={false}
          leftSection={
            restricted ? <IconLock size={16} /> : <IconUsers size={16} />
          }
        />
        <Text size="xs" c="dimmed" mt={4}>
          {restricted
            ? t(
                "Only the people and groups below can view this page and its sub-pages.",
              )
            : t(
                "Space members can access this page according to their space role.",
              )}
        </Text>
      </Box>

      {restricted && (
        <>
          <Divider />
          {canManage && (
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <Box style={{ flex: 1 }}>
                <MultiMemberSelect value={memberIds} onChange={setMemberIds} />
              </Box>
              <Select
                data={[
                  { value: "writer", label: t("Can edit") },
                  { value: "reader", label: t("Can view") },
                ]}
                value={role}
                onChange={(value) =>
                  value && setRole(value as PagePermissionRole)
                }
                allowDeselect={false}
                variant="filled"
                w={110}
                aria-label={t("Role")}
              />
              <Button
                onClick={onAdd}
                disabled={memberIds.length === 0}
                loading={add.isPending}
              >
                {t("Add")}
              </Button>
            </Group>
          )}
          <Text size="xs" c="dimmed">
            {t("People must also be members of this space to open the page.")}
          </Text>
          <PagePermissionList pageId={pageId} canManage={canManage} />
        </>
      )}
    </Stack>
  );
}
