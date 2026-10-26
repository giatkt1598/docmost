import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Card,
  Group,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import {
  Base,
  BaseProperty,
  BaseRow,
  BaseView,
  RowReferenceMap,
} from "@/features/base/types/base.types";
import { basesApi } from "@/features/base/services/bases-api";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import { getPropertyTypeComponents } from "@/features/base/registry/property-types";
import { registerCellComponents } from "@/features/base/components/cells/register-cells";
import { ChoiceChip } from "@/features/base/components/common/choice-chip";
import { buildColumns } from "@/features/base/utils/grid-columns";
import { flattenRows, mergeReferences } from "@/features/base/utils/row-cache";
import { readCell } from "@/features/base/utils/cell-values";
import { sortByPosition } from "@/features/base/utils/position";
import {
  boardColumns,
  cardProperties,
  columnIdOfRow,
  resolveGroupProperty,
} from "@/features/base/utils/kanban";
import { PublicBaseAccess } from "@/features/base-public/public-base-context";

registerCellComponents();

// Rows of a view through the public endpoint only (no session needed).
function usePublicRows(pageId: string, access: PublicBaseAccess, view: BaseView | undefined) {
  const query = {
    filter: view?.config?.filter,
    sorts: view?.type === "kanban" ? undefined : view?.config?.sorts,
  };
  return useInfiniteQuery({
    queryKey: [...baseKeys.publicRows(pageId, access, query), view?.id],
    enabled: !!view,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => basesApi.publicView.rows(pageId, access, query, pageParam),
    getNextPageParam: ({ meta }) =>
      meta.hasNextPage && meta.nextCursor ? meta.nextCursor : undefined,
  });
}

function ReadOnlyCell({
  property,
  row,
  references,
}: {
  property: BaseProperty;
  row: BaseRow;
  references: RowReferenceMap;
}) {
  const Cell = getPropertyTypeComponents(property.type).Cell;
  if (!Cell) return null;
  return <Cell property={property} row={row} value={readCell(property, row)} references={references} />;
}

type Props = { pageId: string; access: PublicBaseAccess };

// Read-only base for people viewing a public share or published space.
export function PublicBaseView({ pageId, access }: Props) {
  const { t } = useTranslation();
  const { data: base, isLoading, isError } = useQuery({
    queryKey: baseKeys.publicInfo(pageId, access),
    queryFn: () => basesApi.publicView.info(pageId, access),
    retry: false,
  });
  const [viewId, setViewId] = useState<string | null>(null);
  const views = useMemo(() => sortByPosition(base?.views ?? []), [base?.views]);
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const rows = usePublicRows(pageId, access, view);
  const items = useMemo(() => flattenRows(rows.data), [rows.data]);
  const references = useMemo(() => mergeReferences(rows.data?.pages ?? []), [rows.data]);

  if (isLoading) return <Skeleton height={160} radius="sm" />;
  if (isError || !base || !view) {
    return (
      <Text size="sm" c="dimmed">
        {t("This base is not available.")}
      </Text>
    );
  }

  const properties = buildColumns(base.properties, view.config).map((c) => c.property);
  const group = view.type === "kanban" ? resolveGroupProperty(base.properties, view.config) : null;

  return (
    <Stack gap="xs" my="md" miw={0} maw="100%">
      {views.length > 1 && (
        <Tabs value={view.id} onChange={setViewId}>
          <Tabs.List>
            {views.map((v) => (
              <Tabs.Tab key={v.id} value={v.id}>
                {v.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}
      {rows.isLoading ? (
        <Skeleton height={120} radius="sm" />
      ) : group ? (
        <PublicBoard base={base} view={view} group={group} rows={items} references={references} />
      ) : (
        <PublicTable properties={properties} rows={items} references={references} />
      )}
      {rows.hasNextPage && (
        <Group justify="center">
          <Button variant="subtle" size="xs" loading={rows.isFetchingNextPage}
            onClick={() => rows.fetchNextPage()}>
            {t("Load more")}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function PublicTable({
  properties,
  rows,
  references,
}: {
  properties: BaseProperty[];
  rows: BaseRow[];
  references: RowReferenceMap;
}) {
  const { t } = useTranslation();
  return (
    <ScrollArea type="auto" offsetScrollbars maw="100%">
      <Table withTableBorder withColumnBorders verticalSpacing={6} miw="100%">
        <Table.Thead>
          <Table.Tr>
            {properties.map((p) => (
              <Table.Th key={p.id} style={{ whiteSpace: "nowrap", minWidth: 140 }}>
                {p.name}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.id}>
              {properties.map((p) => (
                <Table.Td key={p.id} style={{ verticalAlign: "top", maxWidth: 360 }}>
                  <ReadOnlyCell property={p} row={row} references={references} />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
          {rows.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={properties.length}>
                <Text size="sm" c="dimmed">
                  {t("No rows")}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

function PublicBoard({
  base,
  view,
  group,
  rows,
  references,
}: {
  base: Base;
  view: BaseView;
  group: BaseProperty;
  rows: BaseRow[];
  references: RowReferenceMap;
}) {
  const { t } = useTranslation();
  const ordered = buildColumns(base.properties, { ...view.config, hiddenPropertyIds: [] }).map(
    (c) => c.property,
  );
  const primary = ordered.find((p) => p.isPrimary) ?? null;
  const fields = cardProperties(ordered, view.config.visiblePropertyIds);
  const columns = boardColumns(group, view.config).filter((c) => !c.hidden);
  const byColumn = new Map<string, BaseRow[]>();
  for (const row of rows) {
    const key = columnIdOfRow(row, group);
    byColumn.set(key, [...(byColumn.get(key) ?? []), row]);
  }

  return (
    <ScrollArea type="auto" offsetScrollbars maw="100%">
      <Group align="flex-start" wrap="nowrap" gap="sm">
        {columns.map((col) => {
          const cards = byColumn.get(col.id) ?? [];
          return (
            <Paper key={col.id} withBorder p="xs" w={260} miw={260} radius="sm">
              <Group gap={6} mb="xs">
                {col.choice ? (
                  <ChoiceChip choice={col.choice} />
                ) : (
                  <Text size="xs" fw={600} c="dimmed">
                    {t("No value")}
                  </Text>
                )}
                <Text size="xs" c="dimmed">
                  {cards.length}
                </Text>
              </Group>
              <Stack gap={6}>
                {cards.map((row) => {
                  const title = primary ? readCell(primary, row) : null;
                  return (
                    <Card key={row.id} withBorder padding="xs" radius="sm">
                      <Text size="sm" fw={500}>
                        {(typeof title === "string" && title) || t("Untitled")}
                      </Text>
                      {fields.map((p) => (
                        <Box key={p.id} mt={4}>
                          <ReadOnlyCell property={p} row={row} references={references} />
                        </Box>
                      ))}
                    </Card>
                  );
                })}
              </Stack>
            </Paper>
          );
        })}
      </Group>
    </ScrollArea>
  );
}
