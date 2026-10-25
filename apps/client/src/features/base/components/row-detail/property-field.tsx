import { useState } from "react";
import { Group, Popover, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseRow, RowReferenceMap } from "@/features/base/types/base.types";
import {
  getPropertyType,
  getPropertyTypeComponents,
  isPropertyEditable,
} from "@/features/base/registry/property-types";
import { readCell } from "@/features/base/utils/cell-values";

type Props = {
  pageId: string;
  property: BaseProperty;
  row: BaseRow;
  references: RowReferenceMap;
  editable: boolean;
  onSave: (propertyId: string, value: unknown) => void;
};

// One property of the row detail: label and value, editable with the same
// editors as the table.
export function PropertyField({ pageId, property, row, references, editable, onSave }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const def = getPropertyType(property.type);
  const parts = getPropertyTypeComponents(property.type);
  const Icon = def.icon;
  const value = readCell(property, row);
  const canEdit = editable && isPropertyEditable(property);
  const Cell = parts.Cell;
  const Editor = parts.Editor;

  const activate = () => {
    if (!canEdit) return;
    if (parts.activate) onSave(property.id, parts.activate(value));
    else if (Editor) setEditing(true);
  };

  const editorProps = {
    property,
    row,
    value,
    references,
    pageId,
    commit: (v: unknown) => {
      setEditing(false);
      onSave(property.id, v);
    },
    save: (v: unknown) => onSave(property.id, v),
    cancel: () => setEditing(false),
  };

  const display = (
    <UnstyledButton
      onClick={activate}
      disabled={!canEdit}
      aria-label={t("Edit {{name}}", { name: property.name })}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 32,
        padding: "4px 8px",
        borderRadius: 4,
        border: "1px solid transparent",
        cursor: canEdit ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {Cell ? (
        <Cell property={property} row={row} value={value} references={references} />
      ) : null}
      {!Cell && (
        <Text size="sm" c="dimmed">
          —
        </Text>
      )}
    </UnstyledButton>
  );

  let body = display;
  if (editing && Editor) {
    if (parts.editorMode === "inline") {
      body = (
        <div
          style={{
            flex: 1,
            height: 32,
            border: "1px solid var(--mantine-primary-color-filled)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <Editor {...editorProps} />
        </div>
      );
    } else {
      body = (
        <Popover
          opened
          onChange={(o) => !o && setEditing(false)}
          position="bottom-start"
          withinPortal
          shadow="md"
          trapFocus={false}
        >
          <Popover.Target>{display}</Popover.Target>
          <Popover.Dropdown p="xs">
            <Editor {...editorProps} />
          </Popover.Dropdown>
        </Popover>
      );
    }
  }

  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Group gap={6} wrap="nowrap" w={170} pt={6} style={{ flexShrink: 0 }}>
        <Icon size={14} style={{ color: "var(--mantine-color-dimmed)" }} />
        <Tooltip label={property.name} withinPortal openDelay={500}>
          <Text size="sm" c="dimmed" truncate>
            {property.name}
          </Text>
        </Tooltip>
      </Group>
      {body}
    </Group>
  );
}
