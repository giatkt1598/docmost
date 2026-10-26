import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  ColorSwatch,
  Group,
  Menu,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
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
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import {
  CHOICE_PALETTE,
  ChoiceOptions,
  PaletteColor,
  PropertyChoice,
  STATUS_GROUPS,
  StatusGroup,
} from "@/features/base/types/base.types";
import { OptionsEditorProps } from "@/features/base/registry/property-types";
import { choiceDotStyle } from "@/features/base/utils/choice-colors";
import {
  addChoice,
  moveChoice,
  normalizeChoiceOptions,
  removeChoice,
  updateChoice,
} from "@/features/base/utils/choice-edits";
import { NESTED_COMBOBOX_PROPS, NESTED_LAYER_Z } from "@/features/base/components/common/anchored-popover";

const CHOICE_DRAG = "base-choice-option";

export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  todo: "To do",
  inProgress: "In progress",
  complete: "Complete",
};

type RowProps = {
  choice: PropertyChoice;
  index: number;
  count: number;
  status: boolean;
  listId: string;
  onChange: (patch: Partial<Pick<PropertyChoice, "name" | "color" | "category">>) => void;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
};

function ChoiceRow({ choice, index, count, status, listId, onChange, onMove, onRemove }: RowProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    const el = ref.current;
    const handle = handleRef.current;
    if (!el || !handle) return;
    return combine(
      draggable({
        element: el,
        dragHandle: handle,
        getInitialData: () => ({ type: CHOICE_DRAG, listId, index }),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => source.data.type === CHOICE_DRAG && source.data.listId === listId,
        getData: ({ input, element }) =>
          attachClosestEdge({ index }, { input, element, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data) as "top" | "bottom" | null),
        onDragLeave: () => setEdge(null),
        onDrop: ({ source, self }) => {
          setEdge(null);
          const e = extractClosestEdge(self.data);
          const from = source.data.index as number;
          const to = getReorderDestinationIndex({
            startIndex: from,
            indexOfTarget: index,
            closestEdgeOfTarget: e,
            axis: "vertical",
          });
          if (to !== from) moveRef.current(from, to);
        },
      }),
    );
  }, [listId, index]);

  return (
    <Group
      ref={ref}
      gap={6}
      wrap="nowrap"
      style={{
        boxShadow:
          edge === "top"
            ? "0 -2px 0 var(--mantine-primary-color-filled)"
            : edge === "bottom"
              ? "0 2px 0 var(--mantine-primary-color-filled)"
              : undefined,
      }}
    >
      <div ref={handleRef} style={{ cursor: "grab", display: "flex" }} aria-hidden>
        <IconGripVertical size={14} color="var(--mantine-color-dimmed)" />
      </div>
      <Menu position="bottom-start" withinPortal zIndex={NESTED_LAYER_Z}>
        <Menu.Target>
          <ActionIcon variant="subtle" size="sm" aria-label={t("Color")}>
            <span style={{ width: 12, height: 12, borderRadius: 3, ...choiceDotStyle(choice.color) }} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Group gap={6} p={4} maw={180}>
            {CHOICE_PALETTE.map((c) => (
              <ColorSwatch
                key={c}
                component="button"
                type="button"
                size={20}
                color={`var(--mantine-color-${c}-filled)`}
                aria-label={c}
                style={{ cursor: "pointer", outline: choice.color === c ? "2px solid var(--mantine-color-text)" : undefined }}
                onClick={() => onChange({ color: c as PaletteColor })}
              />
            ))}
          </Group>
        </Menu.Dropdown>
      </Menu>
      <TextInput
        size="xs"
        style={{ flex: 1 }}
        value={choice.name}
        maxLength={200}
        aria-label={t("Option name")}
        onChange={(e) => onChange({ name: e.currentTarget.value })}
      />
      {status && (
        <Select
          size="xs"
          w={120}
          allowDeselect={false}
          comboboxProps={NESTED_COMBOBOX_PROPS}
          aria-label={t("Status group")}
          data={STATUS_GROUPS.map((g) => ({ value: g, label: t(STATUS_GROUP_LABELS[g]) }))}
          value={choice.category ?? "todo"}
          onChange={(g) => g && onChange({ category: g as StatusGroup })}
        />
      )}
      <ActionIcon size="sm" variant="subtle" color="gray" disabled={index === 0}
        aria-label={t("Move up")} onClick={() => onMove(index, index - 1)}>
        <IconArrowUp size={14} />
      </ActionIcon>
      <ActionIcon size="sm" variant="subtle" color="gray" disabled={index === count - 1}
        aria-label={t("Move down")} onClick={() => onMove(index, index + 1)}>
        <IconArrowDown size={14} />
      </ActionIcon>
      <ActionIcon size="sm" variant="subtle" color="red" aria-label={t("Delete option")} onClick={onRemove}>
        <IconTrash size={14} />
      </ActionIcon>
    </Group>
  );
}

// Options of select, status and multi-select properties.
export function ChoicesOptions({ property, typeOptions, onChange }: OptionsEditorProps) {
  const { t } = useTranslation();
  const opts = normalizeChoiceOptions(typeOptions as ChoiceOptions);
  const status = property.type === "status";
  const multi = property.type === "multiSelect";
  const [draft, setDraft] = useState("");
  const listId = `choices-${property.id}`;

  const add = () => {
    if (!draft.trim()) return;
    onChange(addChoice(opts, draft, status));
    setDraft("");
  };

  const defaultData = opts.choices.map((c) => ({ value: c.id, label: c.name || t("Untitled") }));

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t("Options")}
      </Text>
      {opts.choices.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("No options yet")}
        </Text>
      )}
      {opts.choices.map((c, i) => (
        <ChoiceRow
          key={c.id}
          choice={c}
          index={i}
          count={opts.choices.length}
          status={status}
          listId={listId}
          onChange={(patch) => onChange(updateChoice(opts, c.id, patch))}
          onMove={(from, to) => onChange(moveChoice(opts, from, to))}
          onRemove={() => onChange(removeChoice(opts, c.id))}
        />
      ))}
      <Group gap={6} wrap="nowrap">
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          placeholder={t("New option")}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button size="compact-sm" variant="light" leftSection={<IconPlus size={14} />} onClick={add}
          disabled={!draft.trim()}>
          {t("Add")}
        </Button>
      </Group>
      {multi ? (
        <MultiSelect
          size="xs"
          label={t("Default value")}
          clearable
          comboboxProps={NESTED_COMBOBOX_PROPS}
          data={defaultData}
          value={Array.isArray(opts.defaultValue) ? opts.defaultValue : []}
          onChange={(v) => onChange({ ...opts, defaultValue: v.length ? v : null })}
        />
      ) : (
        <Select
          size="xs"
          label={t("Default value")}
          clearable
          comboboxProps={NESTED_COMBOBOX_PROPS}
          data={defaultData}
          value={typeof opts.defaultValue === "string" ? opts.defaultValue : null}
          onChange={(v) => onChange({ ...opts, defaultValue: v ?? null })}
        />
      )}
    </Stack>
  );
}
