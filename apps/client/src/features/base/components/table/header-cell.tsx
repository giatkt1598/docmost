import { useEffect, useRef, useState } from "react";
import { Loader, Menu, TextInput, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconAdjustments,
  IconArrowBarLeft,
  IconArrowBarRight,
  IconEyeOff,
  IconPencil,
  IconReplace,
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
import { getPropertyType, hasTypeOptions } from "@/features/base/registry/property-types";
import { PropertyMenuAction } from "@/features/base/components/properties/property-dialogs";
import { GridColumn } from "@/features/base/utils/grid-columns";
import classes from "./grid.module.css";

export const COLUMN_DRAG = "base-column";

type Props = {
  column: GridColumn;
  instanceId: string;
  editable: boolean;
  onRename: (name: string) => void;
  onAction: (action: PropertyMenuAction, anchor: HTMLElement | null) => void;
  onHide: () => void;
  onDelete: () => void;
  onMove: (movedId: string, edge: "left" | "right") => void;
  onResize: (width: number, done: boolean) => void;
};

export function HeaderCell({
  column,
  instanceId,
  editable,
  onRename,
  onAction,
  onHide,
  onDelete,
  onMove,
  onResize,
}: Props) {
  const { t } = useTranslation();
  const { property, width, pinned } = column;
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<"left" | "right" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [resizing, setResizing] = useState(false);
  const def = getPropertyType(property.type);
  const Icon = def.icon;
  const converting = !!property.pendingType;

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    const el = ref.current;
    if (!el || !editable || pinned) return;
    return combine(
      draggable({
        element: el,
        getInitialData: () => ({ type: COLUMN_DRAG, instanceId, id: property.id }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          source.data.type === COLUMN_DRAG &&
          source.data.instanceId === instanceId &&
          source.data.id !== property.id,
        getData: ({ input, element }) =>
          attachClosestEdge({ id: property.id }, { input, element, allowedEdges: ["left", "right"] }),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data) as "left" | "right" | null),
        onDragLeave: () => setEdge(null),
        onDrop: ({ source, self }) => {
          setEdge(null);
          const e = extractClosestEdge(self.data);
          if (e === "left" || e === "right") onMoveRef.current(source.data.id as string, e);
        },
      }),
    );
  }, [editable, pinned, instanceId, property.id]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setResizing(true);
    const move = (ev: PointerEvent) => onResize(width + ev.clientX - startX, false);
    const up = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setResizing(false);
      onResize(width + ev.clientX - startX, true);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: t("Delete property"),
      children: t('Delete "{{name}}" and its values in every row?', { name: property.name }),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: onDelete,
    });

  const finishRename = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (name && name !== property.name) onRename(name);
  };

  return (
    <div
      ref={ref}
      className={`${classes.headerCell} ${pinned ? classes.frozen : ""}`}
      style={{ width }}
      data-dragging={dragging || undefined}
      data-drop-edge={edge ?? undefined}
      role="columnheader"
    >
      {renaming ? (
        <TextInput
          size="xs"
          autoFocus
          defaultValue={property.name}
          maxLength={100}
          style={{ flex: 1 }}
          onBlur={(e) => finishRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") finishRename(e.currentTarget.value);
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <Menu position="bottom-start" withinPortal disabled={!editable}>
          <Menu.Target>
            <button type="button" className={classes.headerButton} title={property.name}>
              <Icon size={14} style={{ flexShrink: 0 }} />
              <span className={classes.headerName}>{property.name}</span>
              {converting && (
                <Tooltip label={t("Converting…")} withinPortal>
                  <Loader size={10} />
                </Tooltip>
              )}
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t(def.label)}</Menu.Label>
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenaming(true)}>
              {t("Rename")}
            </Menu.Item>
            {(hasTypeOptions(property.type) || property.type === "formula") && (
              <Menu.Item
                leftSection={<IconAdjustments size={14} />}
                disabled={converting}
                onClick={() => onAction("options", ref.current)}
              >
                {property.type === "formula" ? t("Edit formula") : t("Options")}
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<IconReplace size={14} />}
              disabled={converting}
              onClick={() => onAction("changeType", ref.current)}
            >
              {t("Change type")}
            </Menu.Item>
            <Menu.Divider />
            {!property.isPrimary && (
              <Menu.Item leftSection={<IconArrowBarLeft size={14} />} onClick={() => onAction("insertLeft", ref.current)}>
                {t("Insert left")}
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconArrowBarRight size={14} />} onClick={() => onAction("insertRight", ref.current)}>
              {t("Insert right")}
            </Menu.Item>
            {!property.isPrimary && (
              <Menu.Item leftSection={<IconEyeOff size={14} />} onClick={onHide}>
                {t("Hide")}
              </Menu.Item>
            )}
            {!property.isPrimary && (
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={confirmDelete}>
                {t("Delete")}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      )}
      {editable && (
        <div
          className={classes.resizer}
          data-resizing={resizing || undefined}
          onPointerDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label={t("Resize column")}
        />
      )}
    </div>
  );
}
