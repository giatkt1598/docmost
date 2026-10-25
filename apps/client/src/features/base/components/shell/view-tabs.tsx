import { useState } from "react";
import { ActionIcon, Button, Group, Menu, TextInput, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconChevronDown,
  IconLayoutKanban,
  IconPencil,
  IconPlus,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseView, ViewKind } from "@/features/base/types/base.types";
import { defaultGroupProperty } from "@/features/base/utils/kanban";
import {
  useCreateViewMutation,
  useDeleteViewMutation,
  useUpdateViewMutation,
} from "@/features/base/queries/base-view-query";

const kindIcon = (kind: ViewKind) =>
  kind === "kanban" ? <IconLayoutKanban size={14} /> : <IconTable size={14} />;

type Props = {
  pageId: string;
  views: BaseView[];
  properties: BaseProperty[];
  activeId: string | null;
  onSelect: (viewId: string) => void;
  editable: boolean;
};

export function ViewTabs({ pageId, views, properties, activeId, onSelect, editable }: Props) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState<string | null>(null);
  const createView = useCreateViewMutation(pageId);
  const updateView = useUpdateViewMutation(pageId);
  const deleteView = useDeleteViewMutation(pageId);

  const add = async (type: ViewKind) => {
    const view = await createView.mutateAsync({
      name: type === "kanban" ? t("Board") : t("Table"),
      type,
      // boards group by a status (or select) property when there is one
      ...(type === "kanban" && defaultGroupProperty(properties)
        ? { config: { groupByPropertyId: defaultGroupProperty(properties)!.id } }
        : {}),
    });
    onSelect(view.id);
  };

  const rename = (view: BaseView, name: string) => {
    setRenaming(null);
    const trimmed = name.trim();
    if (trimmed && trimmed !== view.name) {
      updateView.mutate({ viewId: view.id, name: trimmed });
    }
  };

  const remove = (view: BaseView) =>
    modals.openConfirmModal({
      title: t("Delete view"),
      children: t('Delete the view "{{name}}"? Rows are not affected.', { name: view.name }),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        const next = views.find((v) => v.id !== view.id);
        if (next && view.id === activeId) onSelect(next.id);
        deleteView.mutate(view.id);
      },
    });

  return (
    <Group gap={4} wrap="nowrap" style={{ overflowX: "auto", minWidth: 0 }}>
      {views.map((view) => {
        const active = view.id === activeId;
        if (renaming === view.id) {
          return (
            <TextInput
              key={view.id}
              size="xs"
              w={160}
              autoFocus
              defaultValue={view.name}
              maxLength={100}
              onBlur={(e) => rename(view, e.currentTarget.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") rename(view, e.currentTarget.value);
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          );
        }
        return (
          <Group key={view.id} gap={0} wrap="nowrap">
            <Button
              size="compact-sm"
              variant={active ? "light" : "subtle"}
              color={active ? undefined : "gray"}
              leftSection={kindIcon(view.type)}
              onClick={() => onSelect(view.id)}
              onDoubleClick={editable ? () => setRenaming(view.id) : undefined}
              styles={{ label: { maxWidth: 180 } }}
            >
              {view.name || t("Untitled")}
            </Button>
            {active && editable && (
              <Menu position="bottom-start" withinPortal>
                <Menu.Target>
                  <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t("View options")}>
                    <IconChevronDown size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenaming(view.id)}>
                    {t("Rename")}
                  </Menu.Item>
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    disabled={views.length <= 1}
                    onClick={() => remove(view)}
                  >
                    {t("Delete")}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        );
      })}
      {editable && (
        <Menu position="bottom-start" withinPortal>
          <Menu.Target>
            <Tooltip label={t("Add view")} withinPortal>
              <ActionIcon variant="subtle" color="gray" size="sm" loading={createView.isPending}>
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconTable size={14} />} onClick={() => add("table")}>
              {t("Table")}
            </Menu.Item>
            <Menu.Item leftSection={<IconLayoutKanban size={14} />} onClick={() => add("kanban")}>
              {t("Board")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  );
}
