import { useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Menu,
  Select,
  SimpleGrid,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconDots,
  IconEdit,
  IconEye,
  IconPlus,
  IconSearch,
  IconTemplate,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import StarButton from "@/features/favorite/components/star-button.tsx";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import {
  useDeleteTemplateMutation,
  useTemplatesQuery,
} from "@/features/template/queries/template-query";
import { ITemplate } from "@/features/template/types/template.types";
import { CreateTemplateModal } from "@/features/template/components/create-template-modal";
import { TemplatePreviewModal } from "@/features/template/components/template-preview-modal";
import { UseTemplateModal } from "@/features/template/components/use-template-modal";

export default function TemplateList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [spaceFilter, setSpaceFilter] = useState<string | null>(null);
  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [toUse, setToUse] = useState<ITemplate | null>(null);
  const deleteMutation = useDeleteTemplateMutation();

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useTemplatesQuery({
      spaceId: spaceFilter ?? undefined,
      query: debouncedSearch || undefined,
    });
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const spaceNames = useMemo(
    () => new Map((spaces?.items ?? []).map((s) => [s.id, s.name])),
    [spaces],
  );
  const templates = data?.pages.flatMap((page) => page.items) ?? [];

  const confirmDelete = (template: ITemplate) =>
    modals.openConfirmModal({
      title: t("Are you sure you want to delete this template?"),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(template.id),
    });

  return (
    <Container size="lg" py="xl">
      <DocumentTitle title={t("Templates")} />

      <Group justify="space-between" mb="lg">
        <Title order={3}>{t("Templates")}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          {t("New template")}
        </Button>
      </Group>

      <Group mb="lg" gap="sm" wrap="wrap">
        <TextInput
          placeholder={t("Search templates...")}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <Select
          placeholder={t("All templates")}
          clearable
          value={spaceFilter}
          onChange={(value) => setSpaceFilter(value ? String(value) : null)}
          data={(spaces?.items ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          w={220}
        />
      </Group>

      {isLoading ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : templates.length === 0 ? (
        <Text c="dimmed" ta="center" p="xl">
          {t("No templates found")}
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {templates.map((template) => (
            <Card key={template.id} withBorder padding="md" radius="md">
              <Group justify="space-between" wrap="nowrap" mb="xs">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  {template.icon ? (
                    <Text size="lg">{template.icon}</Text>
                  ) : (
                    <IconTemplate size={20} />
                  )}
                  <Text fw={500} lineClamp={1}>
                    {template.title || t("Untitled")}
                  </Text>
                </Group>
                <Group gap={2} wrap="nowrap">
                  <StarButton
                    type="template"
                    templateId={template.id}
                    name={template.title ?? undefined}
                  />
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={t("Template menu")}
                      >
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconEye size={14} />}
                        onClick={() => setPreviewId(template.id)}
                      >
                        {t("Preview")}
                      </Menu.Item>
                      {template.permissions?.canManage && (
                        <>
                          <Menu.Item
                            leftSection={<IconEdit size={14} />}
                            onClick={() =>
                              navigate(`/templates/${template.id}`)
                            }
                          >
                            {t("Edit")}
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => confirmDelete(template)}
                          >
                            {t("Delete")}
                          </Menu.Item>
                        </>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Group>

              <Text size="sm" c="dimmed" lineClamp={2} mih={40}>
                {template.description || t("No description")}
              </Text>

              <Group justify="space-between" mt="md" wrap="nowrap">
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  {template.creator && (
                    <CustomAvatar
                      avatarUrl={template.creator.avatarUrl}
                      name={template.creator.name}
                      size={20}
                    />
                  )}
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {template.spaceId
                      ? (spaceNames.get(template.spaceId) ?? t("Space"))
                      : t("Global")}
                  </Text>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => setToUse(template)}
                >
                  {t("Use")}
                </Button>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {hasNextPage && (
        <Group justify="center" mt="lg">
          <Button
            variant="default"
            onClick={() => fetchNextPage()}
            loading={isFetchingNextPage}
          >
            {t("Load more")}
          </Button>
        </Group>
      )}

      <CreateTemplateModal
        opened={createOpened}
        onClose={closeCreate}
        defaultSpaceId={spaceFilter ?? undefined}
      />
      <TemplatePreviewModal
        templateId={previewId}
        onClose={() => setPreviewId(null)}
        onUse={(template) => {
          setPreviewId(null);
          setToUse(template);
        }}
      />
      <UseTemplateModal template={toUse} onClose={() => setToUse(null)} />
    </Container>
  );
}
