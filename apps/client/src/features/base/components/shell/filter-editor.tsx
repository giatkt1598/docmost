import { ActionIcon, Box, Button, Group, Select, Stack, Text } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, FilterCondition, FilterOp, RowFilter } from "@/features/base/types/base.types";
import { FILTER_OPERATOR_LABELS } from "@/features/base/registry/filter-operators";
import { getPropertyType, propertyFilterOperators } from "@/features/base/registry/property-types";
import {
  addCondition,
  addGroup,
  emptyFilter,
  FilterPath,
  isGroup,
  MAX_GROUP_DEPTH,
  newCondition,
  removeNode,
  setGroupOp,
  updateCondition,
} from "@/features/base/utils/filter-tree";
import { FilterValueInput } from "./filter-value-input";

type Props = {
  filter: RowFilter | null;
  properties: BaseProperty[];
  onChange: (filter: RowFilter | null) => void;
};

// Builds the filter tree: conditions and nested and/or groups.
export function FilterEditor({ filter, properties, onChange }: Props) {
  const { t } = useTranslation();
  const root = filter ?? emptyFilter();
  const filterable = properties.filter((p) => propertyFilterOperators(p).length > 0);
  const first = filterable[0];
  const set = (next: RowFilter) => onChange(next.children.length ? next : null);

  if (!first) {
    return <Text size="sm" c="dimmed">{t("No properties to filter by")}</Text>;
  }

  return (
    <Stack gap="xs" w={600} maw="calc(100vw - 32px)">
      {root.children.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("No filters applied to this view")}
        </Text>
      )}
      <GroupBody
        group={root}
        path={[]}
        properties={filterable}
        onChange={set}
        root={root}
      />
      <Group gap="xs">
        <Button
          size="compact-sm"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          onClick={() => set(addCondition(root, [], newCondition(first)))}
        >
          {t("Add filter")}
        </Button>
        <Button
          size="compact-sm"
          variant="subtle"
          color="gray"
          leftSection={<IconPlus size={14} />}
          onClick={() => set(addGroup(root, [], newCondition(first)))}
        >
          {t("Add filter group")}
        </Button>
      </Group>
    </Stack>
  );
}

type BodyProps = {
  group: RowFilter;
  path: FilterPath;
  properties: BaseProperty[];
  root: RowFilter;
  onChange: (root: RowFilter) => void;
};

function Joiner({ index, group, path, root, onChange }: { index: number } & Omit<BodyProps, "properties">) {
  const { t } = useTranslation();
  if (index === 0) {
    return <Text size="xs" c="dimmed" w={64}>{t("Where")}</Text>;
  }
  if (index === 1) {
    return (
      <Select
        size="xs"
        w={64}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        data={[
          { value: "and", label: t("And") },
          { value: "or", label: t("Or") },
        ]}
        value={group.op}
        onChange={(op) => op && onChange(setGroupOp(root, path, op as "and" | "or"))}
      />
    );
  }
  return <Text size="xs" c="dimmed" w={64}>{group.op === "and" ? t("And") : t("Or")}</Text>;
}

function GroupBody(props: BodyProps) {
  const { t } = useTranslation();
  const { group, path, properties, root, onChange } = props;
  return (
    <Stack gap={6}>
      {group.children.map((child, i) => {
        const childPath = [...path, i];
        return (
          <Group key={i} gap={6} wrap="nowrap" align="flex-start">
            <Joiner index={i} {...props} />
            {isGroup(child) ? (
              <Box
                p={6}
                style={{
                  flex: 1,
                  border: "1px solid var(--mantine-color-default-border)",
                  borderRadius: 6,
                }}
              >
                <GroupBody {...props} group={child} path={childPath} />
                <Group gap={4} mt={6}>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={<IconPlus size={12} />}
                    onClick={() =>
                      onChange(addCondition(root, childPath, newCondition(properties[0])))
                    }
                  >
                    {t("Add filter")}
                  </Button>
                  {childPath.length < MAX_GROUP_DEPTH && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconPlus size={12} />}
                      onClick={() =>
                        onChange(addGroup(root, childPath, newCondition(properties[0])))
                      }
                    >
                      {t("Add filter group")}
                    </Button>
                  )}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    onClick={() => onChange(removeNode(root, childPath))}
                  >
                    {t("Remove group")}
                  </Button>
                </Group>
              </Box>
            ) : (
              <ConditionRow
                condition={child}
                properties={properties}
                onChange={(patch) => onChange(updateCondition(root, childPath, patch, properties))}
                onRemove={() => onChange(removeNode(root, childPath))}
              />
            )}
          </Group>
        );
      })}
    </Stack>
  );
}

function ConditionRow({
  condition,
  properties,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  properties: BaseProperty[];
  onChange: (patch: Partial<FilterCondition>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const property = properties.find((p) => p.id === condition.propertyId);
  const ops = property ? propertyFilterOperators(property) : [];
  return (
    <Group gap={6} wrap="nowrap" style={{ flex: 1 }}>
      <Select
        size="xs"
        w={150}
        searchable
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        data={properties.map((p) => ({ value: p.id, label: p.name || t(getPropertyType(p.type).label) }))}
        value={property ? property.id : null}
        placeholder={t("Deleted property")}
        onChange={(id) => id && onChange({ propertyId: id })}
      />
      <Select
        size="xs"
        w={140}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        data={ops.map((op) => ({ value: op, label: t(FILTER_OPERATOR_LABELS[op]) }))}
        value={ops.includes(condition.op) ? condition.op : null}
        onChange={(op) => op && onChange({ op: op as FilterOp })}
      />
      {property && (
        <FilterValueInput
          property={property}
          condition={condition}
          onChange={(value) => onChange({ value })}
        />
      )}
      <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t("Remove filter")} onClick={onRemove}>
        <IconTrash size={14} />
      </ActionIcon>
    </Group>
  );
}
