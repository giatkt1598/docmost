import { useState } from "react";
import { Button, Group, Paper, Select, Stack, Text } from "@mantine/core";
import { IconLayoutKanban, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseView } from "@/features/base/types/base.types";
import { useUpdateViewMutation } from "@/features/base/queries/base-view-query";
import { useCreatePropertyMutation } from "@/features/base/queries/base-property-query";
import { groupableProperties, seedStatusOptions } from "@/features/base/utils/kanban";
import { uniquePropertyName } from "@/features/base/utils/property-names";

type Props = {
  pageId: string;
  view: BaseView;
  properties: BaseProperty[];
  editable: boolean;
};

// A board needs a select or status property to group by.
export function KanbanEmptyState({ pageId, view, properties, editable }: Props) {
  const { t } = useTranslation();
  const options = groupableProperties(properties);
  const [picked, setPicked] = useState<string | null>(options[0]?.id ?? null);
  const updateView = useUpdateViewMutation(pageId);
  const createProperty = useCreatePropertyMutation(pageId);

  const groupBy = (propertyId: string) =>
    updateView.mutate({ viewId: view.id, config: { groupByPropertyId: propertyId } });

  const createStatus = async () => {
    const property = await createProperty.mutateAsync({
      name: uniquePropertyName(t("Status"), properties.map((p) => p.name)),
      type: "status",
      typeOptions: seedStatusOptions({
        todo: t("Not started"),
        inProgress: t("In progress"),
        done: t("Done"),
      }),
    });
    groupBy(property.id);
  };

  return (
    <Paper withBorder radius="md" p="xl" mt="xs">
      <Stack align="center" gap="sm">
        <IconLayoutKanban size={28} stroke={1.5} />
        <Text size="sm" c="dimmed" ta="center">
          {editable
            ? t("Choose a select or status property to group the board by.")
            : t("This board has no property to group by yet.")}
        </Text>
        {editable && (
          <>
            {options.length > 0 && (
              <Group gap="xs">
                <Select
                  size="xs"
                  w={200}
                  allowDeselect={false}
                  data={options.map((p) => ({ value: p.id, label: p.name }))}
                  value={picked}
                  onChange={(v) => setPicked(v == null ? null : String(v))}
                />
                <Button size="xs" disabled={!picked} loading={updateView.isPending}
                  onClick={() => picked && groupBy(picked)}>
                  {t("Group by")}
                </Button>
              </Group>
            )}
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />}
              loading={createProperty.isPending} onClick={createStatus}>
              {t("Create a Status property")}
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
