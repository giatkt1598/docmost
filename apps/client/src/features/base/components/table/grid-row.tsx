import { memo, useEffect, useRef, useState } from "react";
import { ActionIcon, Checkbox, Menu, Tooltip } from "@mantine/core";
import {
  IconArrowsDiagonal,
  IconDots,
  IconGripVertical,
  IconRowInsertBottom,
  IconTrash,
} from "@tabler/icons-react";
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
import { BaseRow, RowReferenceMap } from "@/features/base/types/base.types";
import { EditorExit, isPropertyEditable } from "@/features/base/registry/property-types";
import { GridColumn, GUTTER_WIDTH } from "@/features/base/utils/grid-columns";
import { EditState, GridCell } from "./grid-cell";
import classes from "./grid.module.css";

export const ROW_DRAG = "base-row";

export type RowActions = {
  onPointer: (row: number, col: number, startEdit: boolean) => void;
  onCommit: (rowId: string, propertyId: string, value: unknown, exit?: EditorExit) => void;
  onSave: (rowId: string, propertyId: string, value: unknown) => void;
  onCancel: () => void;
  onToggleSelect: (rowId: string, shiftKey: boolean) => void;
  onExpand: (rowId: string) => void;
  onInsertBelow: (rowId: string) => void;
  onDelete: (rowId: string) => void;
  onDropRow: (movedId: string, targetId: string, edge: "top" | "bottom") => void;
};

type Props = {
  pageId: string;
  row: BaseRow;
  index: number;
  top: number;
  width: number;
  columns: GridColumn[];
  references: RowReferenceMap;
  selected: boolean;
  activeCol: number | null;
  editing: EditState | null;
  editable: boolean;
  draggableRows: boolean;
  instanceId: string;
  actions: RowActions;
};

function GridRowInner(props: Props) {
  const { t } = useTranslation();
  const { row, index, columns, editable, actions } = props;
  const ref = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropRef = useRef(actions.onDropRow);
  dropRef.current = actions.onDropRow;

  useEffect(() => {
    const el = ref.current;
    const handle = handleRef.current;
    if (!el || !handle || !props.draggableRows) return;
    return combine(
      draggable({
        element: el,
        dragHandle: handle,
        getInitialData: () => ({ type: ROW_DRAG, instanceId: props.instanceId, id: row.id }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          source.data.type === ROW_DRAG &&
          source.data.instanceId === props.instanceId &&
          source.data.id !== row.id,
        getData: ({ input, element }) =>
          attachClosestEdge({ id: row.id }, { input, element, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data) as "top" | "bottom" | null),
        onDragLeave: () => setEdge(null),
        onDrop: ({ source, self }) => {
          setEdge(null);
          const e = extractClosestEdge(self.data);
          if (e === "top" || e === "bottom") dropRef.current(source.data.id as string, row.id, e);
        },
      }),
    );
  }, [props.draggableRows, props.instanceId, row.id]);

  return (
    <div
      ref={ref}
      className={classes.row}
      style={{ width: props.width, transform: `translateY(${props.top}px)` }}
      role="row"
      aria-rowindex={index + 2}
      data-selected={props.selected || undefined}
      data-dragging={dragging || undefined}
      data-drop-edge={edge ?? undefined}
    >
      <div
        className={`${classes.gutter} ${classes.pinned}`}
        style={{ width: GUTTER_WIDTH }}
        data-menu-open={menuOpen || undefined}
      >
        <span className={classes.rowNumber}>{index + 1}</span>
        <div className={classes.gutterTools}>
          {props.draggableRows && (
            <div ref={handleRef} className={classes.dragHandle} aria-label={t("Drag to reorder")}>
              <IconGripVertical size={14} />
            </div>
          )}
          {editable && (
            <Checkbox
              size="xs"
              aria-label={t("Select row")}
              checked={props.selected}
              onChange={() => undefined}
              onClick={(e) => actions.onToggleSelect(row.id, e.shiftKey)}
            />
          )}
          <Tooltip label={t("Open")} withinPortal openDelay={400}>
            <ActionIcon size="xs" variant="subtle" color="gray" aria-label={t("Open row")}
              onClick={() => actions.onExpand(row.id)}>
              <IconArrowsDiagonal size={12} />
            </ActionIcon>
          </Tooltip>
          {editable && (
            <Menu position="bottom-start" withinPortal onChange={setMenuOpen}>
              <Menu.Target>
                <ActionIcon size="xs" variant="subtle" color="gray" aria-label={t("Row options")}>
                  <IconDots size={12} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconRowInsertBottom size={14} />}
                  onClick={() => actions.onInsertBelow(row.id)}>
                  {t("Insert below")}
                </Menu.Item>
                <Menu.Item color="red" leftSection={<IconTrash size={14} />}
                  onClick={() => actions.onDelete(row.id)}>
                  {t("Delete")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </div>
      </div>
      {columns.map((column, col) => (
        <GridCell
          key={column.property.id}
          pageId={props.pageId}
          column={column}
          row={row}
          references={props.references}
          rowIndex={index}
          colIndex={col}
          active={props.activeCol === col}
          editing={props.activeCol === col ? props.editing : null}
          canEdit={editable && isPropertyEditable(column.property)}
          onPointer={actions.onPointer}
          onCommit={actions.onCommit}
          onSave={actions.onSave}
          onCancel={actions.onCancel}
        />
      ))}
    </div>
  );
}

export const GridRow = memo(GridRowInner);
