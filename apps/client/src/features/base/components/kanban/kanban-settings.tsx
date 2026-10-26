import { useRef } from "react";
import { ActionIcon, Button, Group, Popover, ScrollArea, Select, Stack, Switch, Text } from "@mantine/core";
import { IconAdjustments, IconCards, IconLayoutColumns } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseView } from "@/features/base/types/base.types";
import { getPropertyType, hasTypeOptions } from "@/features/base/registry/property-types";
import { usePropertyDialogs } from "@/features/base/components/properties/property-dialogs";
import { useUpdateViewMutation } from "@/features/base/queries/base-view-query";
import { orderProperties, toggleHidden } from "@/features/base/utils/grid-columns";
import { groupableProperties, resolveGroupProperty } from "@/features/base/utils/kanban";

type Props = {
  pageId: string;
  view: BaseView;
  properties: BaseProperty[];
  editable: boolean;
};

// Toolbar controls of a board: the group-by property and the card fields.
export function KanbanSettings({ pageId, view, properties, editable }: Props) {
  const { t } = useTranslation();
  const updateView = useUpdateViewMutation(pageId);
  const group = resolveGroupProperty(properties, view.config);
  const visible = view.config.visiblePropertyIds ?? [];
  const fields = orderProperties(properties, view.config.propertyOrder).filter((p) => !p.isPrimary);
  // the options popover opens at this button: the property list it was
  // started from closes together with its own popover
  const cardsButton = useRef<HTMLButtonElement>(null);
  const dialogs = usePropertyDialogs({ pageId, view, properties, rows: [] });

  return (
    <Group gap={4} wrap="nowrap">
      <Popover position="bottom-end" withinPortal shadow="md">
        <Popover.Target>
          <Button size="compact-sm" variant="subtle" color="gray" leftSection={<IconLayoutColumns size={14} />}>
            {group ? t("Group: {{name}}", { name: group.name }) : t("Group by")}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Select
            size="xs"
            w={220}
            label={t("Group by")}
            disabled={!editable}
            allowDeselect={false}
            comboboxProps={{ withinPortal: false }}
            data={groupableProperties(properties).map((p) => ({ value: p.id, label: p.name }))}
            value={group?.id ?? null}
            placeholder={t("Select or status property")}
            onChange={(id) =>
              id && updateView.mutate({ viewId: view.id, config: { groupByPropertyId: id } })
            }
          />
        </Popover.Dropdown>
      </Popover>

      <Popover position="bottom-end" withinPortal shadow="md">
        <Popover.Target>
          <Button ref={cardsButton} size="compact-sm" variant="subtle" color="gray" leftSection={<IconCards size={14} />}>
            {t("Card properties")}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <ScrollArea.Autosize mah={320}>
            <Stack gap={6} w={240}>
              {fields.length === 0 && (
                <Text size="sm" c="dimmed">
                  {t("No other properties")}
                </Text>
              )}
              {fields.map((p) => {
                const Icon = getPropertyType(p.type).icon;
                return (
                  <Group key={p.id} justify="space-between" wrap="nowrap">
                    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                      <Icon size={14} />
                      <Text size="sm" truncate>
                        {p.name}
                      </Text>
                    </Group>
                    <Group gap={4} wrap="nowrap">
                    {editable && (hasTypeOptions(p.type) || p.type === "formula") && (
                      <ActionIcon size="sm" variant="subtle" color="gray"
                        aria-label={t("{{name}} options", { name: p.name })}
                        onClick={() => dialogs.open(p.id, "options", cardsButton.current)}>
                        <IconAdjustments size={14} />
                      </ActionIcon>
                    )}
                    <Switch
                      size="xs"
                      disabled={!editable}
                      checked={visible.includes(p.id)}
                      onChange={(e) =>
                        updateView.mutate({
                          viewId: view.id,
                          // same set logic as hidden columns, inverted
                          config: { visiblePropertyIds: toggleHidden(visible, p.id, e.currentTarget.checked) },
                        })
                      }
                    />
                    </Group>
                  </Group>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        </Popover.Dropdown>
      </Popover>
      {dialogs.element}
    </Group>
  );
}
