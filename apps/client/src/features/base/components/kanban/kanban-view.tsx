import { useEffect, useId, useMemo, useRef } from "react";
import { Button, Menu } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import {
  BaseProperty,
  BaseView,
  BaseViewConfigPatch,
  ChoiceOptions,
  PropertyChoice,
  RowFilter,
} from "@/features/base/types/base.types";
import { useUpdateViewMutation } from "@/features/base/queries/base-view-query";
import { useUpdatePropertyMutation } from "@/features/base/queries/base-property-query";
import { useUpdateRowMutation } from "@/features/base/queries/base-row-query";
import { useOpenRow } from "@/features/base/hooks/use-active-view";
import { orderProperties } from "@/features/base/utils/grid-columns";
import {
  boardColumns,
  cardProperties,
  cellsForColumn,
  moveColumn,
  resolveGroupProperty,
  setColumnHidden,
} from "@/features/base/utils/kanban";
import { KanbanColumn } from "./kanban-column";
import { KanbanEmptyState } from "./kanban-empty-state";
import classes from "./kanban.module.css";

type Props = {
  pageId: string;
  view: BaseView;
  properties: BaseProperty[];
  filter: RowFilter | undefined;
  search: string;
  editable: boolean;
  fill?: boolean;
};

export function KanbanView({ pageId, view, properties, filter, search, editable, fill }: Props) {
  const { t } = useTranslation();
  const boardId = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const updateView = useUpdateViewMutation(pageId);
  const updateProperty = useUpdatePropertyMutation(pageId);
  const updateRow = useUpdateRowMutation(pageId);
  const openRow = useOpenRow(pageId);

  const group = resolveGroupProperty(properties, view.config);
  const columns = useMemo(() => (group ? boardColumns(group, view.config) : []), [group, view.config]);
  const ordered = useMemo(
    () => orderProperties(properties, view.config.propertyOrder),
    [properties, view.config.propertyOrder],
  );
  const primary = ordered.find((p) => p.isPrimary) ?? null;
  const fields = useMemo(
    () => cardProperties(ordered, view.config.visiblePropertyIds),
    [ordered, view.config.visiblePropertyIds],
  );

  useEffect(() => {
    const el = boardRef.current;
    if (!el || !editable) return;
    return autoScrollForElements({ element: el });
  }, [editable, group?.id]);

  if (!group) {
    return <KanbanEmptyState pageId={pageId} view={view} properties={properties} editable={editable} />;
  }

  const setConfig = (config: BaseViewConfigPatch) =>
    updateView.mutate({ viewId: view.id, config });

  const moveCard = (rowId: string, from: string, to: string, position: string) =>
    updateRow.mutate({
      rowId,
      position,
      ...(from !== to ? { cells: cellsForColumn(group.id, to) } : {}),
    });

  const editChoice = (choiceId: string, patch: Partial<Pick<PropertyChoice, "name" | "color">>) => {
    const opts = group.typeOptions as ChoiceOptions;
    updateProperty.mutate({
      propertyId: group.id,
      typeOptions: {
        ...opts,
        choices: opts.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)),
      },
    });
  };

  const hidden = columns.filter((c) => c.hidden);

  return (
    <div ref={boardRef} className={classes.board} data-fill={fill || undefined}>
      {columns
        .filter((c) => !c.hidden)
        .map((column) => (
          <KanbanColumn
            key={column.id}
            pageId={pageId}
            boardId={boardId}
            column={column}
            group={group}
            primary={primary}
            fields={fields}
            filter={filter}
            search={search}
            editable={editable}
            onOpen={openRow}
            onMoveCard={moveCard}
            onMoveColumn={(movedId, targetId, edge) =>
              setConfig({ choiceOrder: moveColumn(columns, movedId, targetId, edge) })
            }
            onHideColumn={(id) =>
              setConfig({ hiddenChoiceIds: setColumnHidden(view.config.hiddenChoiceIds, id, true) })
            }
            onEditChoice={editChoice}
          />
        ))}
      {hidden.length > 0 && (
        <div className={classes.hiddenColumns}>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button size="compact-sm" variant="subtle" color="gray" leftSection={<IconEye size={14} />}>
                {t("{{count}} hidden columns", { count: hidden.length })}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {hidden.map((c) => (
                <Menu.Item
                  key={c.id}
                  disabled={!editable}
                  onClick={() =>
                    setConfig({
                      hiddenChoiceIds: setColumnHidden(view.config.hiddenChoiceIds, c.id, false),
                    })
                  }
                >
                  {t("Show {{name}}", { name: c.choice ? c.choice.name : t("No value") })}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      )}
    </div>
  );
}
