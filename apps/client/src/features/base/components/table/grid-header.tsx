import { Checkbox } from "@mantine/core";
import { BaseProperty } from "@/features/base/types/base.types";
import { useTranslation } from "react-i18next";
import {
  ADD_COLUMN_WIDTH,
  GridColumn,
  GUTTER_WIDTH,
} from "@/features/base/utils/grid-columns";
import { SelectAllState } from "@/features/base/utils/row-selection";
import { HeaderCell } from "./header-cell";
import { PropertyMenuAction } from "@/features/base/components/properties/property-dialogs";
import { AddPropertyButton } from "./add-property-button";
import classes from "./grid.module.css";

type Props = {
  pageId: string;
  columns: GridColumn[];
  width: number;
  instanceId: string;
  editable: boolean;
  selectAll: SelectAllState;
  onSelectAll: (select: boolean) => void;
  properties: BaseProperty[];
  onRename: (propertyId: string, name: string) => void;
  onPropertyAction: (propertyId: string, action: PropertyMenuAction, anchor: HTMLElement | null) => void;
  onHide: (propertyId: string) => void;
  onDelete: (propertyId: string) => void;
  onMove: (movedId: string, targetId: string, edge: "left" | "right") => void;
  onResize: (propertyId: string, width: number, done: boolean) => void;
};

export function GridHeader(props: Props) {
  const { t } = useTranslation();
  const { columns, editable, selectAll } = props;
  return (
    <div className={classes.header} style={{ width: props.width }} role="row">
      <div className={`${classes.gutter} ${classes.pinned}`} style={{ width: GUTTER_WIDTH }}>
        {editable && (
          <Checkbox
            size="xs"
            aria-label={t("Select all rows")}
            checked={selectAll === "all"}
            indeterminate={selectAll === "some"}
            onChange={(e) => props.onSelectAll(e.currentTarget.checked)}
          />
        )}
      </div>
      {columns.map((column) => (
        <HeaderCell
          key={column.property.id}
          column={column}
          instanceId={props.instanceId}
          editable={editable}
          onRename={(name) => props.onRename(column.property.id, name)}
          onAction={(action, anchor) => props.onPropertyAction(column.property.id, action, anchor)}
          onHide={() => props.onHide(column.property.id)}
          onDelete={() => props.onDelete(column.property.id)}
          onMove={(movedId, edge) => props.onMove(movedId, column.property.id, edge)}
          onResize={(w, done) => props.onResize(column.property.id, w, done)}
        />
      ))}
      {editable && (
        <div className={classes.addColumn} style={{ width: ADD_COLUMN_WIDTH }}>
          <AddPropertyButton pageId={props.pageId} properties={props.properties} />
        </div>
      )}
    </div>
  );
}
