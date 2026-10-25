import { memo, useEffect, useRef, useState } from "react";
import { Text } from "@mantine/core";
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
import { BaseProperty, BaseRow, RowReferenceMap } from "@/features/base/types/base.types";
import { getPropertyTypeComponents } from "@/features/base/registry/property-types";
import { isEmptyCell, readCell } from "@/features/base/utils/cell-values";
import classes from "./kanban.module.css";

export const CARD_DRAG = "base-card";

type Props = {
  row: BaseRow;
  columnId: string;
  primary: BaseProperty | null;
  fields: BaseProperty[];
  references: RowReferenceMap;
  boardId: string;
  draggableCard: boolean;
  onOpen: (rowId: string) => void;
};

function KanbanCardInner({
  row,
  columnId,
  primary,
  fields,
  references,
  boardId,
  draggableCard,
  onOpen,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !draggableCard) return;
    return combine(
      draggable({
        element: el,
        getInitialData: () => ({ type: CARD_DRAG, boardId, rowId: row.id, columnId }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      // edge feedback only; the column handles the drop
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          source.data.type === CARD_DRAG &&
          source.data.boardId === boardId &&
          source.data.rowId !== row.id,
        getData: ({ input, element }) =>
          attachClosestEdge({ rowId: row.id }, { input, element, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data) as "top" | "bottom" | null),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [draggableCard, boardId, row.id, columnId]);

  const title = primary ? readCell(primary, row) : null;

  return (
    <div
      ref={ref}
      className={classes.card}
      data-dragging={dragging || undefined}
      data-drop-edge={edge ?? undefined}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.stopPropagation();
          onOpen(row.id);
        }
      }}
    >
      <div className={classes.cardTitle}>
        {typeof title === "string" && title.trim() ? (
          title
        ) : (
          <Text span c="dimmed" size="sm">
            {t("Untitled")}
          </Text>
        )}
      </div>
      {fields.map((p) => {
        const value = readCell(p, row);
        const Cell = getPropertyTypeComponents(p.type).Cell;
        if (!Cell || (isEmptyCell(value) && p.type !== "checkbox")) return null;
        return (
          <div key={p.id} className={classes.cardField} title={p.name}>
            <Cell property={p} row={row} value={value} references={references} />
          </div>
        );
      })}
    </div>
  );
}

export const KanbanCard = memo(KanbanCardInner);
