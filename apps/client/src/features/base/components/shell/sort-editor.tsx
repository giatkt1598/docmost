import { ActionIcon, Button, Group, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, SortRule } from "@/features/base/types/base.types";
import { isPropertySortable } from "@/features/base/registry/property-types";
import { addSortRule, moveSortRule } from "@/features/base/utils/sort-rules";

type Props = {
  sorts: SortRule[] | null;
  properties: BaseProperty[];
  onChange: (sorts: SortRule[] | null) => void;
};

// Sort levels: the first rule wins, later ones break ties.
export function SortEditor({ sorts, properties, onChange }: Props) {
  const { t } = useTranslation();
  const rules = sorts ?? [];
  const sortable = properties.filter(isPropertySortable);
  const set = (next: SortRule[]) => onChange(next.length ? next : null);
  const unused = sortable.filter((p) => !rules.some((r) => r.propertyId === p.id));

  return (
    <Stack gap="xs" w={420} maw="calc(100vw - 32px)">
      {rules.length === 0 && (
        <Text size="sm" c="dimmed">
          {t("No sorts applied to this view")}
        </Text>
      )}
      {rules.map((rule, i) => (
        <Group key={rule.propertyId} gap={6} wrap="nowrap">
          <Select
            size="xs"
            style={{ flex: 1 }}
            searchable
            allowDeselect={false}
            comboboxProps={{ withinPortal: false }}
            data={sortable
              .filter((p) => p.id === rule.propertyId || !rules.some((r) => r.propertyId === p.id))
              .map((p) => ({ value: p.id, label: p.name }))}
            value={sortable.some((p) => p.id === rule.propertyId) ? rule.propertyId : null}
            placeholder={t("Deleted property")}
            onChange={(id) =>
              id && set(rules.map((r, j) => (j === i ? { ...r, propertyId: id } : r)))
            }
          />
          <SegmentedControl
            size="xs"
            data={[
              { value: "asc", label: t("Ascending") },
              { value: "desc", label: t("Descending") },
            ]}
            value={rule.direction}
            onChange={(d) =>
              set(rules.map((r, j) => (j === i ? { ...r, direction: d as SortRule["direction"] } : r)))
            }
          />
          <ActionIcon size="sm" variant="subtle" color="gray" disabled={i === 0} aria-label={t("Move up")}
            onClick={() => set(moveSortRule(rules, i, -1))}>
            <IconArrowUp size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="gray" disabled={i === rules.length - 1}
            aria-label={t("Move down")} onClick={() => set(moveSortRule(rules, i, 1))}>
            <IconArrowDown size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t("Remove sort")}
            onClick={() => set(rules.filter((_, j) => j !== i))}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Group>
        <Button
          size="compact-sm"
          variant="subtle"
          leftSection={<IconPlus size={14} />}
          disabled={unused.length === 0}
          onClick={() => set(addSortRule(rules, unused[0].id))}
        >
          {t("Add sort")}
        </Button>
      </Group>
    </Stack>
  );
}
