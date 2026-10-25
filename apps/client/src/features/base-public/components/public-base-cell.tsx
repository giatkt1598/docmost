import { Anchor, Badge, Group, Text } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import {
  Choice,
  DateTypeOptions,
  IBaseProperty,
  IBaseRow,
  NumberTypeOptions,
  RowReferences,
  SelectTypeOptions,
} from "@/ee/base/types/base.types";
import {
  formatDateDisplay,
  formatNumber,
  formatTimestamp,
} from "@/ee/base/formatters/cell-formatters";
import { choiceColor } from "@/ee/base/components/cells/choice-color";

const asList = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v == null ? [] : [v];

function ChoiceBadges({
  prop,
  value,
}: {
  prop: IBaseProperty;
  value: unknown;
}) {
  const options = prop.typeOptions as SelectTypeOptions;
  const byId = new Map<string, Choice>(
    (options?.choices ?? []).map((c) => [c.id, c]),
  );
  const choices = asList(value)
    .map((id) => byId.get(String(id)))
    .filter((c): c is Choice => !!c);
  if (choices.length === 0) return null;
  return (
    <Group gap={4} wrap="nowrap">
      {choices.map((c) => (
        <Badge
          key={c.id}
          size="sm"
          radius="sm"
          variant="light"
          tt="none"
          style={options?.disableColors ? undefined : choiceColor(c.color)}
        >
          {c.name}
        </Badge>
      ))}
    </Group>
  );
}

// Read-only rendering of one cell for public viewers.
export function PublicBaseCell({
  prop,
  row,
  references,
}: {
  prop: IBaseProperty;
  row: IBaseRow;
  references: RowReferences;
}) {
  const value = row.cells[prop.id];
  const userName = (id: unknown) =>
    (typeof id === "string" && references.users[id]?.name) || "";

  switch (prop.type) {
    case "createdAt":
      return <Text size="sm">{formatTimestamp(row.createdAt)}</Text>;
    case "lastEditedAt":
      return <Text size="sm">{formatTimestamp(row.updatedAt)}</Text>;
    case "lastEditedBy":
      return (
        <Text size="sm">{userName(row.lastUpdatedById ?? row.creatorId)}</Text>
      );
  }
  if (value === undefined || value === null || value === "") return null;

  switch (prop.type) {
    case "select":
    case "status":
    case "multiSelect":
      return <ChoiceBadges prop={prop} value={value} />;
    case "checkbox":
      return value === true ? <IconCheck size={16} /> : null;
    case "number":
      return (
        <Text size="sm" ta="right">
          {formatNumber(Number(value), prop.typeOptions as NumberTypeOptions)}
        </Text>
      );
    case "date":
      return (
        <Text size="sm">
          {formatDateDisplay(
            String(value),
            prop.typeOptions as DateTypeOptions,
          )}
        </Text>
      );
    case "person":
      return (
        <Text size="sm">
          {asList(value).map(userName).filter(Boolean).join(", ")}
        </Text>
      );
    case "file":
      return (
        <Text size="sm">
          {asList(value)
            .map((f: any) => f?.fileName)
            .filter(Boolean)
            .join(", ")}
        </Text>
      );
    case "url":
      // only web links are clickable, never javascript: and the like
      if (!/^https?:\/\//i.test(String(value))) {
        return <Text size="sm">{String(value)}</Text>;
      }
      return (
        <Anchor
          size="sm"
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {String(value)}
        </Anchor>
      );
    case "email":
      return (
        <Anchor size="sm" href={`mailto:${String(value)}`}>
          {String(value)}
        </Anchor>
      );
    case "page":
      // linked pages are not resolved for public viewers
      return null;
    default:
      if (typeof value === "object") {
        return "__err" in (value as object) ? (
          <Text size="sm">#ERROR</Text>
        ) : null;
      }
      return (
        <Text size="sm" lineClamp={3}>
          {String(value)}
        </Text>
      );
  }
}
