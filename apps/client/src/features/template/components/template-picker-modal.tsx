import { useMemo, useState } from "react";
import {
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch, IconTemplate } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTemplatesQuery } from "@/features/template/queries/template-query";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { ITemplate } from "@/features/template/types/template.types";
import { TemplatePreviewModal } from "@/features/template/components/template-preview-modal";
import { UseTemplateModal } from "@/features/template/components/use-template-modal";

interface TemplatePickerModalProps {
  opened: boolean;
  onClose: () => void;
  initialSpaceId?: string;
  // When set, the caller applies the template itself (e.g. into an empty
  // page); otherwise a new page is created at a chosen destination.
  onUse?: (template: ITemplate) => void;
}

export default function TemplatePickerModal({
  opened,
  onClose,
  initialSpaceId,
  onUse,
}: TemplatePickerModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [scope, setScope] = useState<"current" | "all">(
    initialSpaceId ? "current" : "all",
  );
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [toUse, setToUse] = useState<ITemplate | null>(null);

  const spaceFilter =
    scope === "current" && initialSpaceId ? initialSpaceId : undefined;
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useTemplatesQuery({
      spaceId: spaceFilter,
      query: debouncedSearch || undefined,
    });
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const spaceNames = useMemo(
    () => new Map((spaces?.items ?? []).map((s) => [s.id, s.name])),
    [spaces],
  );
  const templates = data?.pages.flatMap((page) => page.items) ?? [];

  const handleUse = (template: ITemplate) => {
    setPreviewId(null);
    if (onUse) {
      onUse(template);
      onClose();
    } else {
      setToUse(template);
    }
  };

  return (
    <>
      <Modal
        opened={opened && !toUse}
        onClose={onClose}
        size="lg"
        title={<Text fw={500}>{t("Use a template")}</Text>}
      >
        <Stack gap="sm">
          <TextInput
            placeholder={t("Search templates...")}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            data-autofocus
          />
          {initialSpaceId && (
            <SegmentedControl
              value={scope}
              onChange={(value) => setScope(value as "current" | "all")}
              data={[
                { label: t("This space"), value: "current" },
                { label: t("All templates"), value: "all" },
              ]}
            />
          )}

          <ScrollArea.Autosize mah={400}>
            {isLoading ? (
              <Group justify="center" p="md">
                <Loader size="sm" />
              </Group>
            ) : templates.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center" p="md">
                {t("No templates found")}
              </Text>
            ) : (
              <Stack gap={4}>
                {templates.map((template) => (
                  <Group
                    key={template.id}
                    justify="space-between"
                    wrap="nowrap"
                    p="xs"
                  >
                    <UnstyledButton
                      onClick={() => setPreviewId(template.id)}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <Group gap="sm" wrap="nowrap">
                        {template.icon ? (
                          <Text>{template.icon}</Text>
                        ) : (
                          <IconTemplate size={18} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={500} lineClamp={1}>
                            {template.title || t("Untitled")}
                          </Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {template.spaceId
                              ? (spaceNames.get(template.spaceId) ?? t("Space"))
                              : t("Global")}
                            {template.description
                              ? ` · ${template.description}`
                              : ""}
                          </Text>
                        </div>
                      </Group>
                    </UnstyledButton>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => handleUse(template)}
                    >
                      {t("Use")}
                    </Button>
                  </Group>
                ))}
                {hasNextPage && (
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => fetchNextPage()}
                    loading={isFetchingNextPage}
                  >
                    {t("Load more")}
                  </Button>
                )}
              </Stack>
            )}
          </ScrollArea.Autosize>

          <Button
            component={Link}
            to="/templates"
            variant="subtle"
            size="xs"
            onClick={onClose}
          >
            {t("Browse all templates")}
          </Button>
        </Stack>
      </Modal>

      <TemplatePreviewModal
        templateId={previewId}
        onClose={() => setPreviewId(null)}
        onUse={handleUse}
      />

      <UseTemplateModal
        template={toUse}
        initialSpaceId={initialSpaceId}
        onClose={() => {
          setToUse(null);
          onClose();
        }}
      />
    </>
  );
}
