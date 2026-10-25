import { Button, Group, Popover, ScrollArea, Stack, Switch, Text } from "@mantine/core";
import { IconEyeOff } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseView } from "@/features/base/types/base.types";
import { getPropertyType } from "@/features/base/registry/property-types";
import { orderProperties, toggleHidden } from "@/features/base/utils/grid-columns";
import { useUpdateViewMutation } from "@/features/base/queries/base-view-query";

type Props = {
  pageId: string;
  view: BaseView;
  properties: BaseProperty[];
  editable: boolean;
};

// Shows / hides table columns (hiddenPropertyIds, saved for everyone).
export function ColumnsMenu({ pageId, view, properties, editable }: Props) {
  const { t } = useTranslation();
  const updateView = useUpdateViewMutation(pageId);
  const hidden = view.config.hiddenPropertyIds ?? [];
  const list = orderProperties(properties, view.config.propertyOrder).filter((p) => !p.isPrimary);
  const hiddenCount = list.filter((p) => hidden.includes(p.id)).length;

  const setHidden = (ids: string[]) =>
    updateView.mutate({ viewId: view.id, config: { hiddenPropertyIds: ids } });

  return (
    <Popover position="bottom-end" withinPortal shadow="md">
      <Popover.Target>
        <Button
          size="compact-sm"
          variant="subtle"
          color={hiddenCount ? undefined : "gray"}
          leftSection={<IconEyeOff size={14} />}
        >
          {hiddenCount ? t("{{count}} hidden", { count: hiddenCount }) : t("Properties")}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6} w={260}>
          <ScrollArea.Autosize mah={320}>
            <Stack gap={6}>
              {list.map((p) => {
                const Icon = getPropertyType(p.type).icon;
                return (
                  <Group key={p.id} justify="space-between" wrap="nowrap">
                    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                      <Icon size={14} />
                      <Text size="sm" truncate>
                        {p.name}
                      </Text>
                    </Group>
                    <Switch
                      size="xs"
                      disabled={!editable}
                      checked={!hidden.includes(p.id)}
                      onChange={(e) => setHidden(toggleHidden(hidden, p.id, !e.currentTarget.checked))}
                    />
                  </Group>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
          {editable && list.length > 0 && (
            <Group grow>
              <Button size="compact-xs" variant="light" onClick={() => setHidden([])}>
                {t("Show all")}
              </Button>
              <Button size="compact-xs" variant="light" color="gray"
                onClick={() => setHidden(list.map((p) => p.id))}>
                {t("Hide all")}
              </Button>
            </Group>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
