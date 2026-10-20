import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Table,
  Text,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconDots, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ISsoProvider } from "@/features/sso/types/sso.types";
import {
  useDeleteSsoProviderMutation,
  useSsoProvidersQuery,
} from "@/features/sso/queries/sso-query";
import { SsoProviderModal } from "@/features/sso/components/sso-provider-modal";

const TYPE_LABELS: Record<string, string> = {
  oidc: "OpenID Connect",
  google: "Google",
  saml: "SAML",
  ldap: "LDAP",
};

export function SsoProviderList() {
  const { t } = useTranslation();
  const { data: providers = [] } = useSsoProvidersQuery();
  const deleteMutation = useDeleteSsoProviderMutation();
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<ISsoProvider | null>(null);

  const openModal = (provider: ISsoProvider | null) => {
    setEditing(provider);
    setOpened(true);
  };

  const confirmDelete = (provider: ISsoProvider) =>
    modals.openConfirmModal({
      title: t("Delete SSO provider"),
      children: (
        <Text size="sm">
          {t(
            "Members will no longer be able to sign in with {{name}}. This cannot be undone.",
            { name: provider.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(provider.id),
    });

  return (
    <>
      <Group justify="space-between" mb="sm">
        <div>
          <Text size="md">{t("Single sign-on providers")}</Text>
          <Text size="sm" c="dimmed">
            {t("Let members sign in with an external identity provider.")}
          </Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          variant="default"
          onClick={() => openModal(null)}
        >
          {t("Add provider")}
        </Button>
      </Group>

      {providers.length > 0 && (
        <Table.ScrollContainer minWidth={420}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Name")}</Table.Th>
                <Table.Th>{t("Type")}</Table.Th>
                <Table.Th>{t("Status")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {providers.map((provider) => (
                <Table.Tr key={provider.id}>
                  <Table.Td>{provider.name}</Table.Td>
                  <Table.Td>
                    {TYPE_LABELS[provider.type] ?? provider.type}
                  </Table.Td>
                  <Table.Td>
                    {!provider.isSupported ? (
                      <Badge color="gray" variant="light">
                        {t("Not supported")}
                      </Badge>
                    ) : provider.isEnabled ? (
                      <Badge color="green" variant="light">
                        {t("Enabled")}
                      </Badge>
                    ) : (
                      <Badge color="gray" variant="light">
                        {t("Disabled")}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={t("Provider actions")}
                          >
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconPencil size={16} />}
                            disabled={!provider.isSupported}
                            onClick={() => openModal(provider)}
                          >
                            {t("Edit")}
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            onClick={() => confirmDelete(provider)}
                          >
                            {t("Delete")}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <SsoProviderModal
        opened={opened}
        onClose={() => setOpened(false)}
        provider={editing}
      />
    </>
  );
}
