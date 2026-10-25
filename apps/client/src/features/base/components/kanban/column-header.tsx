import { useEffect, useRef, useState } from "react";
import { ActionIcon, ColorSwatch, Group, Menu, Popover, SimpleGrid, Text, TextInput } from "@mantine/core";
import { IconDots, IconEyeOff, IconPencil } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { CHOICE_PALETTE, PropertyChoice } from "@/features/base/types/base.types";
import { ChoiceChip } from "@/features/base/components/common/choice-chip";
import { BoardColumn } from "@/features/base/utils/kanban";
import classes from "./kanban.module.css";

export const COLUMN_DRAG = "base-board-column";

type Props = {
  column: BoardColumn;
  count: string;
  boardId: string;
  editable: boolean;
  plain?: boolean;
  columnRef: React.RefObject<HTMLDivElement | null>;
  onDragState: (state: { dragging?: boolean; edge?: "left" | "right" | null }) => void;
  onMoveColumn: (movedId: string, edge: "left" | "right") => void;
  onHide: () => void;
  onEditChoice: (patch: Partial<Pick<PropertyChoice, "name" | "color">>) => void;
};

export function ColumnHeader(props: Props) {
  const { t } = useTranslation();
  const { column, editable, boardId } = props;
  const handleRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const moveRef = useRef(props.onMoveColumn);
  moveRef.current = props.onMoveColumn;
  const stateRef = useRef(props.onDragState);
  stateRef.current = props.onDragState;

  useEffect(() => {
    const el = props.columnRef.current;
    const handle = handleRef.current;
    if (!el || !handle || !editable) return;
    return combine(
      draggable({
        element: el,
        dragHandle: handle,
        getInitialData: () => ({ type: COLUMN_DRAG, boardId, columnId: column.id }),
        onDragStart: () => stateRef.current({ dragging: true }),
        onDrop: () => stateRef.current({ dragging: false }),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          source.data.type === COLUMN_DRAG &&
          source.data.boardId === boardId &&
          source.data.columnId !== column.id,
        getData: ({ input, element }) =>
          attachClosestEdge({ columnId: column.id }, { input, element, allowedEdges: ["left", "right"] }),
        onDrag: ({ self }) =>
          stateRef.current({ edge: extractClosestEdge(self.data) as "left" | "right" | null }),
        onDragLeave: () => stateRef.current({ edge: null }),
        onDrop: ({ source, self }) => {
          stateRef.current({ edge: null });
          const e = extractClosestEdge(self.data);
          if (e === "left" || e === "right") moveRef.current(source.data.columnId as string, e);
        },
      }),
    );
  }, [editable, boardId, column.id, props.columnRef]);

  const name = column.choice ? column.choice.name : t("No value");

  return (
    <div ref={handleRef} className={classes.columnHeader} data-draggable={editable || undefined}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {column.choice ? (
          <ChoiceChip choice={column.choice} plain={props.plain} />
        ) : (
          <Text size="sm" c="dimmed" fw={500}>
            {name}
          </Text>
        )}
        <span className={classes.count}>{props.count}</span>
      </div>
      <Popover opened={editing} onChange={setEditing} position="bottom-end" withinPortal shadow="md">
        <Popover.Target>
          <div>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t("Column options")}
                  onMouseDown={(e) => e.stopPropagation()}>
                  <IconDots size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {editable && column.choice && (
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(true)}>
                    {t("Edit option")}
                  </Menu.Item>
                )}
                <Menu.Item leftSection={<IconEyeOff size={14} />} onClick={props.onHide}
                  disabled={!editable}>
                  {t("Hide column")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          {column.choice && (
            <Group gap="xs" w={220} onKeyDown={(e) => e.stopPropagation()} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <TextInput
                size="xs"
                label={t("Name")}
                defaultValue={column.choice.name}
                maxLength={200}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = e.currentTarget.value.trim();
                    if (v && v !== column.choice!.name) props.onEditChoice({ name: v });
                    setEditing(false);
                  }
                }}
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v && v !== column.choice!.name) props.onEditChoice({ name: v });
                }}
              />
              <Text size="xs" fw={500}>
                {t("Color")}
              </Text>
              <SimpleGrid cols={7} spacing={6}>
                {CHOICE_PALETTE.map((c) => (
                  <ColorSwatch
                    key={c}
                    component="button"
                    type="button"
                    size={22}
                    color={`var(--mantine-color-${c}-filled)`}
                    aria-label={c}
                    style={{ cursor: "pointer", outline: column.choice!.color === c ? "2px solid var(--mantine-color-text)" : undefined }}
                    onClick={() => props.onEditChoice({ color: c })}
                  />
                ))}
              </SimpleGrid>
            </Group>
          )}
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}
