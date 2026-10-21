import {
  ActionIcon,
  Avatar,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconUsersGroup, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import {
  usePagePermissionsQuery,
  useRemovePagePermissionsMutation,
  useUpdatePagePermissionRoleMutation,
} from "@/features/page-permission/queries/page-permission-query";
import {
  IPagePermissionMember,
  PagePermissionRole,
} from "@/features/page-permission/types/page-permission.types";

interface PagePermissionListProps {
  pageId: string;
  canManage: boolean;
}

export function PagePermissionList({
  pageId,
  canManage,
}: PagePermissionListProps) {
  const { t } = useTranslation();
  const { data, isLoading } = usePagePermissionsQuery(pageId);
  const updateRole = useUpdatePagePermissionRoleMutation();
  const remove = useRemovePagePermissionsMutation();

  const roles = [
    { value: "writer", label: t("Can edit") },
    { value: "reader", label: t("Can view") },
  ];

  const target = (member: IPagePermissionMember) =>
    member.type === "user" ? { userId: member.id } : { groupId: member.id };

  if (isLoading) return <Loader size="sm" />;

  return (
    <Stack gap="xs">
      {data?.items.map((member) => (
        <Group key={`${member.type}-${member.id}`} wrap="nowrap" gap="sm">
          {member.type === "user" ? (
            <CustomAvatar
              avatarUrl={member.avatarUrl}
              name={member.name}
              size={32}
            />
          ) : (
            <Avatar size={32} radius="xl">
              <IconUsersGroup size={18} />
            </Avatar>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={500} lineClamp={1}>
              {member.name}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {member.type === "user"
                ? member.email
                : t("{{count}} members", { count: member.memberCount })}
            </Text>
          </div>
          <Select
            data={roles}
            value={member.role}
            onChange={(role) =>
              role &&
              role !== member.role &&
              updateRole.mutate({
                pageId,
                role: role as PagePermissionRole,
                ...target(member),
              })
            }
            disabled={!canManage}
            allowDeselect={false}
            variant="filled"
            size="xs"
            w={110}
            aria-label={t("Role")}
          />
          {canManage && (
            <Tooltip label={t("Remove access")}>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() =>
                  remove.mutate({
                    pageId,
                    ...(member.type === "user"
                      ? { userIds: [member.id] }
                      : { groupIds: [member.id] }),
                  })
                }
                aria-label={t("Remove access")}
              >
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      ))}
    </Stack>
  );
}
