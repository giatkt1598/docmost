import { KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Center, Loader, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseView, RowQuery } from "@/features/base/types/base.types";
import {
  useBaseRows,
  useCreateRowMutation,
  useDeleteRowMutation,
  useDeleteRowsMutation,
  useReorderRowMutation,
  useRestoreRowsMutation,
  useUpdateRowMutation,
} from "@/features/base/queries/base-row-query";
import {
  EditorExit,
  getPropertyType,
  getPropertyTypeComponents,
  isPropertyEditable,
} from "@/features/base/registry/property-types";
import { pickedReferencesAtom } from "@/features/base/atoms/picked-references-atom";
import { useOpenRow } from "@/features/base/hooks/use-active-view";
import { withReferences } from "@/features/base/utils/references";
import { buildColumns, gridWidth } from "@/features/base/utils/grid-columns";
import { afterCommit, CellPos, gridKeyAction } from "@/features/base/utils/grid-navigation";
import {
  clickRow,
  emptySelection,
  pruneSelection,
  selectAll,
  selectAllState,
} from "@/features/base/utils/row-selection";
import { insertIntoView, readCell } from "@/features/base/utils/cell-values";
import { positionBetween } from "@/features/base/utils/position";
import { stableStringify } from "@/features/base/utils/view-drafts";
import { GridHeader } from "./grid-header";
import { GridRow, RowActions } from "./grid-row";
import { EditState } from "./grid-cell";
import { SelectionBar, showUndoToast } from "./selection-bar";
import { useColumnActions } from "./use-column-actions";
import { usePropertyDialogs } from "@/features/base/components/properties/property-dialogs";
import classes from "./grid.module.css";

const ROW_HEIGHT = 34;
const PREFETCH_ROWS = 30;

type Props = {
  pageId: string;
  view: BaseView;
  properties: BaseProperty[];
  query: RowQuery;
  editable: boolean;
  // a row to focus once it is listed (new rows)
  focusRowId?: string | null;
  onFocusHandled?: () => void;
  // fill the parent's height and scroll inside (sticky header); otherwise
  // the rows flow with the page and the window scrolls
  fill?: boolean;
};

export function TableView({
  pageId,
  view,
  properties,
  query,
  editable,
  focusRowId,
  onFocusHandled,
  fill = false,
}: Props) {
  const { t } = useTranslation();
  const instanceId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const { rows, references, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading } =
    useBaseRows(pageId, query);
  const picked = useAtomValue(pickedReferencesAtom);
  const refs = useMemo(() => withReferences(picked, references), [picked, references]);

  const columnActions = useColumnActions(pageId, view, properties);
  const propertyDialogs = usePropertyDialogs({ pageId, view, properties, rows });
  const columns = useMemo(
    () => buildColumns(properties, view.config, columnActions.widthOverrides),
    [properties, view.config, columnActions.widthOverrides],
  );
  const width = gridWidth(columns, editable);

  const [active, setActive] = useState<CellPos | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [selection, setSelection] = useState(emptySelection);
  const order = useMemo(() => rows.map((r) => r.id), [rows]);
  useEffect(() => setSelection((s) => pruneSelection(s, order)), [order]);

  const updateRow = useUpdateRowMutation(pageId);
  const createRow = useCreateRowMutation(pageId);
  const deleteRow = useDeleteRowMutation(pageId);
  const deleteRows = useDeleteRowsMutation(pageId);
  const restoreRows = useRestoreRowsMutation(pageId);
  const reorderRow = useReorderRowMutation(pageId);
  const openRow = useOpenRow(pageId);

  // ---- virtual rows: over the window, or inside the scroller (fill) ------
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const top = fill ? body.offsetTop : body.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(top - scrollMargin) > 1) setScrollMargin(top);
  });
  const windowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin,
    enabled: !fill,
  });
  const boxVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin,
    enabled: fill,
  });
  const virtualizer = fill ? boxVirtualizer : windowVirtualizer;
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length ? items[items.length - 1].index : -1;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - PREFETCH_ROWS) {
      void fetchNextPage();
    }
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ---- latest state for the stable callbacks ------------------------------
  const state = useRef({ rows, columns, active, editing, selection, query });
  state.current = { rows, columns, active, editing, selection, query };

  const focusGrid = () => scrollerRef.current?.focus({ preventScroll: true });

  const scrollToCell = useCallback(
    (pos: CellPos) => {
      virtualizer.scrollToIndex(pos.row, { align: "auto" });
      requestAnimationFrame(() =>
        scrollerRef.current
          ?.querySelector(`[data-cell="${pos.row}:${pos.col}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
      );
    },
    [virtualizer],
  );

  const writeCell = useCallback(
    (rowId: string, propertyId: string, value: unknown) => {
      const row = state.current.rows.find((r) => r.id === rowId);
      const current = row ? row.cells?.[propertyId] ?? null : undefined;
      if (stableStringify(current) === stableStringify(value ?? null)) return;
      updateRow.mutate({ rowId, cells: { [propertyId]: value ?? null } });
    },
    [updateRow],
  );

  const startEditing = useCallback(
    (pos: CellPos, initialInput?: string) => {
      const { rows: list, columns: cols } = state.current;
      const row = list[pos.row];
      const column = cols[pos.col];
      if (!editable || !row || !column || !isPropertyEditable(column.property)) return;
      const parts = getPropertyTypeComponents(column.property.type);
      if (parts.activate) {
        writeCell(row.id, column.property.id, parts.activate(readCell(column.property, row)));
      } else if (parts.Editor) {
        setEditing({ initialInput });
      }
    },
    [editable, writeCell],
  );

  const actions: RowActions = useMemo(
    () => ({
      onPointer: (row, col, startEdit) => {
        const prev = state.current.active;
        if (!prev || prev.row !== row || prev.col !== col) setEditing(null);
        setActive({ row, col });
        if (startEdit) startEditing({ row, col });
        else focusGrid();
      },
      onCommit: (rowId, propertyId, value, exit?: EditorExit) => {
        setEditing(null);
        writeCell(rowId, propertyId, value);
        const pos = state.current.active;
        if (exit && pos) {
          const next = afterCommit(pos, exit, {
            rows: state.current.rows.length,
            cols: state.current.columns.length,
          });
          setActive(next);
          scrollToCell(next);
        }
        focusGrid();
      },
      onSave: writeCell,
      onCancel: () => {
        setEditing(null);
        focusGrid();
      },
      onToggleSelect: (rowId, shiftKey) =>
        setSelection((s) => clickRow(s, rowId, state.current.rows.map((r) => r.id), shiftKey)),
      onExpand: openRow,
      onInsertBelow: async (rowId) => {
        const row = await createRow.mutateAsync({
          afterRowId: rowId,
          insert: insertIntoView(state.current.query),
        });
        const idx = state.current.rows.findIndex((r) => r.id === row.id);
        if (idx >= 0) {
          setEditing(null);
          setActive({ row: idx, col: 0 });
        }
      },
      onDelete: (rowId) =>
        deleteRow.mutate(rowId, {
          onSuccess: () => showUndoToast(t, 1, () => restoreRows.mutate([rowId])),
        }),
      onDropRow: (movedId, targetId, edge) => {
        const list = state.current.rows.filter((r) => r.id !== movedId);
        const idx = list.findIndex((r) => r.id === targetId);
        if (idx < 0) return;
        const [before, after] =
          edge === "top" ? [list[idx - 1], list[idx]] : [list[idx], list[idx + 1]];
        try {
          const position = positionBetween(before?.position, after?.position);
          reorderRow.mutate({ rowId: movedId, position });
        } catch {
          // neighbours with equal keys: leave the order as it is
        }
      },
    }),
    [startEditing, writeCell, scrollToCell, openRow, createRow, deleteRow, restoreRows, reorderRow, t],
  );

  // ---- keyboard -------------------------------------------------------------
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing || e.target !== scrollerRef.current) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && editable) {
      e.preventDefault();
      setSelection(selectAll(order));
      return;
    }
    if (!active) {
      if (e.key.startsWith("Arrow") && rows.length) {
        e.preventDefault();
        setActive({ row: 0, col: 0 });
      }
      return;
    }
    const action = gridKeyAction(active, e, { rows: rows.length, cols: columns.length });
    switch (action.kind) {
      case "move":
        e.preventDefault();
        setActive(action.to);
        scrollToCell(action.to);
        break;
      case "edit":
        e.preventDefault();
        startEditing(active, action.initialInput);
        break;
      case "clear": {
        const row = rows[active.row];
        const column = columns[active.col];
        if (!editable || !row || !column || !isPropertyEditable(column.property)) break;
        if (!getPropertyType(column.property.type).storedInCells) break;
        e.preventDefault();
        writeCell(row.id, column.property.id, null);
        break;
      }
      case "escape":
        if (selection.ids.size) setSelection(emptySelection());
        else setActive(null);
        break;
    }
  };

  // ---- focus a new row --------------------------------------------------------
  useEffect(() => {
    if (!focusRowId) return;
    const idx = rows.findIndex((r) => r.id === focusRowId);
    if (idx < 0) return;
    const pos = { row: idx, col: 0 };
    setActive(pos);
    scrollToCell(pos);
    if (editable) setEditing({});
    onFocusHandled?.();
  }, [focusRowId, rows, editable, scrollToCell, onFocusHandled]);

  const addRowAtEnd = async () => {
    const row = await createRow.mutateAsync({ insert: insertIntoView(query) });
    const idx = state.current.rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      setActive({ row: idx, col: 0 });
      scrollToCell({ row: idx, col: 0 });
      setEditing({});
    }
  };

  const deleteSelected = () => {
    const ids = [...selection.ids];
    deleteRows.mutate(ids, {
      onSuccess: () => {
        setSelection(emptySelection());
        showUndoToast(t, ids.length, () => restoreRows.mutate(ids));
      },
    });
  };

  const draggableRows = editable && !query.sorts?.length;
  const filtered = !!(query.filter || query.search);

  return (
    <Box className={classes.root} data-fill={fill || undefined}>
      {selection.ids.size > 0 && (
        <SelectionBar
          count={selection.ids.size}
          onDelete={deleteSelected}
          deleting={deleteRows.isPending}
          onClear={() => setSelection(emptySelection())}
        />
      )}
      <div
        ref={scrollerRef}
        className={classes.scroller}
        data-fill={fill || undefined}
        tabIndex={0}
        role="grid"
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length}
        onKeyDown={onKeyDown}
      >
        <div className={classes.canvas} style={{ width }}>
          <GridHeader
            pageId={pageId}
            columns={columns}
            width={width}
            instanceId={instanceId}
            editable={editable}
            selectAll={selectAllState(selection, order)}
            onSelectAll={(all) => setSelection(all ? selectAll(order) : emptySelection())}
            properties={properties}
            onRename={columnActions.rename}
            onPropertyAction={propertyDialogs.open}
            onHide={columnActions.hide}
            onDelete={columnActions.remove}
            onMove={columnActions.move}
            onResize={columnActions.resize}
          />
          <div ref={bodyRef} style={{ position: "relative", height: virtualizer.getTotalSize(), width }}>
            {items.map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const isActiveRow = active?.row === item.index;
              return (
                <GridRow
                  key={row.id}
                  pageId={pageId}
                  row={row}
                  index={item.index}
                  top={item.start - virtualizer.options.scrollMargin}
                  width={width}
                  columns={columns}
                  references={refs}
                  selected={selection.ids.has(row.id)}
                  activeCol={isActiveRow ? active!.col : null}
                  editing={isActiveRow ? editing : null}
                  editable={editable}
                  draggableRows={draggableRows}
                  instanceId={instanceId}
                  actions={actions}
                />
              );
            })}
          </div>
          {isLoading && (
            <Center py="sm">
              <Loader size="xs" />
            </Center>
          )}
          {!isLoading && rows.length === 0 && (
            <Text size="sm" c="dimmed" px="sm" py="xs">
              {filtered ? t("No rows match this view") : t("No rows yet")}
            </Text>
          )}
          {editable && (
            <div className={classes.footer} style={{ width }}>
              <Button size="compact-sm" variant="subtle" color="gray" leftSection={<IconPlus size={14} />}
                onClick={addRowAtEnd} loading={createRow.isPending}>
                {t("New row")}
              </Button>
              {isFetchingNextPage && <Loader size="xs" ml="sm" />}
            </div>
          )}
        </div>
      </div>
      {propertyDialogs.element}
    </Box>
  );
}
