import { memo } from "react";
import { Popover } from "@mantine/core";
import { BaseRow, RowReferenceMap } from "@/features/base/types/base.types";
import {
  EditorExit,
  getPropertyTypeComponents,
} from "@/features/base/registry/property-types";
import { GridColumn } from "@/features/base/utils/grid-columns";
import { readCell } from "@/features/base/utils/cell-values";
import classes from "./grid.module.css";

export type EditState = { initialInput?: string };

type Props = {
  pageId: string;
  column: GridColumn;
  row: BaseRow;
  references: RowReferenceMap;
  rowIndex: number;
  colIndex: number;
  active: boolean;
  editing: EditState | null;
  canEdit: boolean;
  onPointer: (row: number, col: number, startEdit: boolean) => void;
  onCommit: (rowId: string, propertyId: string, value: unknown, exit?: EditorExit) => void;
  onSave: (rowId: string, propertyId: string, value: unknown) => void;
  onCancel: () => void;
};

function GridCellInner(props: Props) {
  const { column, row, references, active, editing, canEdit, rowIndex, colIndex } = props;
  const { property, width, pinned, left } = column;
  const parts = getPropertyTypeComponents(property.type);
  const Cell = parts.Cell;
  const Editor = parts.Editor;
  const value = readCell(property, row);
  const isEditing = !!editing && canEdit && !!Editor;
  const inline = isEditing && parts.editorMode === "inline";

  const editorProps = Editor
    ? {
        property,
        row,
        value,
        references,
        pageId: props.pageId,
        initialInput: editing?.initialInput,
        commit: (v: unknown, exit?: EditorExit) => props.onCommit(row.id, property.id, v, exit),
        save: (v: unknown) => props.onSave(row.id, property.id, v),
        cancel: props.onCancel,
      }
    : null;

  const content = inline && Editor && editorProps ? (
    <Editor {...editorProps} />
  ) : Cell ? (
    <Cell property={property} row={row} value={value} references={references} />
  ) : null;

  const cell = (
    <div
      className={`${classes.cell} ${pinned ? classes.pinned : ""}`}
      style={{ width, ...(pinned ? { left } : {}) }}
      role="gridcell"
      data-cell={`${rowIndex}:${colIndex}`}
      data-active={active || undefined}
      data-editing-inline={inline || undefined}
      data-readonly={!canEdit || undefined}
      onMouseDown={(e) => {
        if (inline) return;
        // one-action types (checkbox) toggle on click; others edit on the
        // second click of the active cell
        const toggle = canEdit && !!parts.activate;
        props.onPointer(rowIndex, colIndex, toggle || (active && e.detail === 1));
      }}
      onDoubleClick={() => !parts.activate && props.onPointer(rowIndex, colIndex, true)}
    >
      {content}
    </div>
  );

  if (!isEditing || inline || !Editor || !editorProps) return cell;
  return (
    <Popover
      opened
      onChange={(open) => !open && props.onCancel()}
      position="bottom-start"
      offset={2}
      withinPortal
      shadow="md"
      trapFocus={false}
      closeOnEscape
    >
      <Popover.Target>{cell}</Popover.Target>
      <Popover.Dropdown p="xs" onMouseDown={(e) => e.stopPropagation()}>
        <Editor {...editorProps} />
      </Popover.Dropdown>
    </Popover>
  );
}

export const GridCell = memo(GridCellInner);
