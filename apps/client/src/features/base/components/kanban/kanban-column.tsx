import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Center, Loader } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  BaseProperty,
  ChoiceOptions,
  PropertyChoice,
  RowFilter,
} from "@/features/base/types/base.types";
import { useBaseRows, useCreateRowMutation } from "@/features/base/queries/base-row-query";
import { pickedReferencesAtom } from "@/features/base/atoms/picked-references-atom";
import { withReferences } from "@/features/base/utils/references";
import { BoardColumn, cardDropPosition, cellsForColumn, columnOf } from "@/features/base/utils/kanban";
import { ColumnHeader } from "./column-header";
import { CARD_DRAG, KanbanCard } from "./kanban-card";
import classes from "./kanban.module.css";

type Props = {
  pageId: string;
  boardId: string;
  column: BoardColumn;
  group: BaseProperty;
  primary: BaseProperty | null;
  fields: BaseProperty[];
  filter: RowFilter | undefined;
  search: string;
  editable: boolean;
  onOpen: (rowId: string) => void;
  onMoveCard: (rowId: string, fromColumnId: string, toColumnId: string, position: string) => void;
  onMoveColumn: (movedId: string, targetId: string, edge: "left" | "right") => void;
  onHideColumn: (columnId: string) => void;
  onEditChoice: (choiceId: string, patch: Partial<Pick<PropertyChoice, "name" | "color">>) => void;
};

export function KanbanColumn(props: Props) {
  const { t } = useTranslation();
  const { pageId, column, group, editable, boardId } = props;
  const columnRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ dragging?: boolean; edge?: "left" | "right" | null }>({});
  const [over, setOver] = useState(false);

  const query = useMemo(
    () => ({ filter: props.filter, search: props.search, column: columnOf(group.id, column.id) }),
    [props.filter, props.search, group.id, column.id],
  );
  const { rows, references, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading } =
    useBaseRows(pageId, query);
  const picked = useAtomValue(pickedReferencesAtom);
  const refs = useMemo(() => withReferences(picked, references), [picked, references]);
  const createRow = useCreateRowMutation(pageId);

  // latest rows for the drop handler
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const moveRef = useRef(props.onMoveCard);
  moveRef.current = props.onMoveCard;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !editable) return;
    return combine(
      autoScrollForElements({ element: list }),
      dropTargetForElements({
        element: list,
        canDrop: ({ source }) => source.data.type === CARD_DRAG && source.data.boardId === boardId,
        getData: () => ({ columnId: column.id }),
        onDragEnter: () => setOver(true),
        onDragLeave: () => setOver(false),
        onDrop: ({ source, location }) => {
          setOver(false);
          const rowId = source.data.rowId as string;
          // the innermost target is a card when dropped on one
          const inner = location.current.dropTargets[0];
          const targetId = inner && inner.element !== list ? (inner.data.rowId as string) : null;
          const edge = targetId ? (extractClosestEdge(inner.data) ?? "bottom") : "bottom";
          let position: string;
          try {
            position = cardDropPosition(rowsRef.current, rowId, targetId, edge as "top" | "bottom");
          } catch {
            return;
          }
          moveRef.current(rowId, source.data.columnId as string, column.id, position);
        },
      }),
    );
  }, [editable, boardId, column.id]);

  // load more when the end of the column comes into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: listRef.current, rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const addCard = async () => {
    // no position: the server appends the row, so it ends the column too
    await createRow.mutateAsync({ cells: cellsForColumn(group.id, column.id) });
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  };

  const count = `${rows.length}${hasNextPage ? "+" : ""}`;

  return (
    <div
      ref={columnRef}
      className={classes.column}
      data-dragging={drag.dragging || undefined}
      data-drop-edge={drag.edge ?? undefined}
    >
      <ColumnHeader
        column={column}
        count={count}
        boardId={boardId}
        editable={editable}
        plain={(group.typeOptions as ChoiceOptions | null)?.disableColors}
        columnRef={columnRef}
        onDragState={(s) => setDrag((d) => ({ ...d, ...s }))}
        onMoveColumn={(movedId, edge) => props.onMoveColumn(movedId, column.id, edge)}
        onHide={() => props.onHideColumn(column.id)}
        onEditChoice={(patch) => props.onEditChoice(column.id, patch)}
      />
      <div ref={listRef} className={classes.cards} data-over={over || undefined}>
        {rows.map((row) => (
          <KanbanCard
            key={row.id}
            row={row}
            columnId={column.id}
            primary={props.primary}
            fields={props.fields}
            references={refs}
            boardId={boardId}
            draggableCard={editable}
            onOpen={props.onOpen}
          />
        ))}
        {(isLoading || isFetchingNextPage) && (
          <Center py={6}>
            <Loader size="xs" />
          </Center>
        )}
        <div ref={sentinelRef} style={{ height: 1, flexShrink: 0 }} />
      </div>
      {editable && (
        <div className={classes.columnFooter}>
          <Button size="compact-sm" variant="subtle" color="gray" fullWidth justify="flex-start"
            leftSection={<IconPlus size={14} />} onClick={addCard} loading={createRow.isPending}>
            {t("New")}
          </Button>
        </div>
      )}
    </div>
  );
}
