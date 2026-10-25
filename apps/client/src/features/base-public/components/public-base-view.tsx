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
  IBase,
  IBaseProperty,
  IBaseRow,
  IBaseView,
  RowReferences,
  SelectTypeOptions,
} from "@/ee/base/types/base.types";
import { choiceColor } from "@/ee/base/components/cells/choice-color";
import { PublicBaseAccess } from "@/features/base-public/public-base-context";
import {
  getPublicBase,
  getPublicBaseRows,
} from "@/features/base-public/services/public-base-service";
import { PublicBaseCell } from "@/features/base-public/components/public-base-cell";

const NO_VALUE = "__no_value";

// Properties of a view in display order, without hidden ones.
function visibleProperties(base: IBase, view: IBaseView): IBaseProperty[] {
  const order = view.config?.propertyOrder ?? [];
  const rank = new Map(order.map((id, i) => [id, i]));
  const hidden = new Set(view.config?.hiddenPropertyIds ?? []);
  return [...base.properties]
    .filter((p) => p.isPrimary || !hidden.has(p.id))
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
    });
}

function usePublicRows(
  pageId: string,
  access: PublicBaseAccess,
  view: IBaseView | undefined,
) {
  const isKanban = view?.type === "kanban";
  return useInfiniteQuery({
    queryKey: ["public-base-rows", pageId, view?.id, access],
    enabled: !!view,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getPublicBaseRows({
        pageId,
        access,
        cursor: pageParam,
        filter: view?.config?.filter,
        sorts: isKanban ? undefined : view?.config?.sorts,
      }),
    getNextPageParam: (last) =>
      last.meta.hasNextPage ? (last.meta.nextCursor ?? undefined) : undefined,
  });
}

type Props = { pageId: string; access: PublicBaseAccess };

// Read-only base for people viewing a public share or published space.
export function PublicBaseView({ pageId, access }: Props) {
  const { t } = useTranslation();
  const {
    data: base,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["public-base", pageId, access],
    queryFn: () => getPublicBase(pageId, access),
    retry: false,
  });
  const [viewId, setViewId] = useState<string | null>(null);
  const view = base?.views.find((v) => v.id === viewId) ?? base?.views[0];
  const rows = usePublicRows(pageId, access, view);

  const items = useMemo(
    () => rows.data?.pages.flatMap((p) => p.items) ?? [],
    [rows.data],
  );
  const references = useMemo<RowReferences>(() => {
    const out: RowReferences = { users: {}, pages: {} };
    for (const p of rows.data?.pages ?? []) {
      Object.assign(out.users, p.references.users);
    }
    return out;
  }, [rows.data]);

  if (isLoading) return <Skeleton height={160} radius="sm" />;
  if (isError || !base || !view) {
    return (
      <Text size="sm" c="dimmed">
        {t("This base is not available.")}
      </Text>
    );
  }

  const properties = visibleProperties(base, view);
  const loadMore = rows.hasNextPage && (
    <Button
      variant="subtle"
      size="xs"
      loading={rows.isFetchingNextPage}
      onClick={() => rows.fetchNextPage()}
    >
      {t("Load more")}
    </Button>
  );

  return (
    <Stack gap="xs" my="md">
      {base.views.length > 1 && (
        <Tabs value={view.id} onChange={setViewId}>
          <Tabs.List>
            {base.views.map((v) => (
              <Tabs.Tab key={v.id} value={v.id}>
                {v.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}
      {rows.isLoading ? (
        <Skeleton height={120} radius="sm" />
      ) : view.type === "kanban" ? (
        <PublicKanban
          base={base}
          view={view}
          rows={items}
          references={references}
        />
      ) : (
        <PublicTable
          properties={properties}
          rows={items}
          references={references}
        />
      )}
      {loadMore && <Group justify="center">{loadMore}</Group>}
    </Stack>
  );
}

function PublicTable({
  properties,
  rows,
  references,
}: {
  properties: IBaseProperty[];
  rows: IBaseRow[];
  references: RowReferences;
}) {
  const { t } = useTranslation();
  return (
    <ScrollArea type="auto" offsetScrollbars>
      <Table withTableBorder withColumnBorders verticalSpacing={6} miw="100%">
        <Table.Thead>
          <Table.Tr>
            {properties.map((p) => (
              <Table.Th
                key={p.id}
                style={{ whiteSpace: "nowrap", minWidth: 140 }}
              >
                {p.name}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.id}>
              {properties.map((p) => (
                <Table.Td key={p.id} style={{ verticalAlign: "top" }}>
                  <PublicBaseCell prop={p} row={row} references={references} />
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

function PublicKanban({
  base,
  view,
  rows,
  references,
}: {
  base: IBase;
  view: IBaseView;
  rows: IBaseRow[];
  references: RowReferences;
}) {
  const { t } = useTranslation();
  const groupBy = base.properties.find(
    (p) => p.id === view.config?.groupByPropertyId,
  );
  if (!groupBy) {
    return (
      <PublicTable
        properties={visibleProperties(base, view)}
        rows={rows}
        references={references}
      />
    );
  }

  const options = groupBy.typeOptions as SelectTypeOptions;
  const choices = options?.choices ?? [];
  const order = view.config?.choiceOrder ?? options?.choiceOrder ?? [];
  const rank = new Map(order.map((id, i) => [id, i]));
  const hidden = new Set(view.config?.hiddenChoiceIds ?? []);
  const columns = [
    ...[...choices]
      .sort(
        (a, b) =>
          (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .map((c) => ({ key: c.id, name: c.name, color: c.color })),
    { key: NO_VALUE, name: t("No value"), color: "gray" },
  ].filter((c) => !hidden.has(c.key));

  const primary = base.properties.find((p) => p.isPrimary);
  const cardProps = (view.config?.visiblePropertyIds ?? [])
    .map((id) => base.properties.find((p) => p.id === id))
    .filter(
      (p): p is IBaseProperty =>
        !!p && p.id !== primary?.id && p.id !== groupBy.id,
    );

  const byColumn = new Map<string, IBaseRow[]>();
  for (const row of rows) {
    const value = row.cells[groupBy.id];
    const key =
      typeof value === "string" && choices.some((c) => c.id === value)
        ? value
        : NO_VALUE;
    const list = byColumn.get(key) ?? [];
    list.push(row);
    byColumn.set(key, list);
  }

  return (
    <ScrollArea type="auto" offsetScrollbars>
      <Group align="flex-start" wrap="nowrap" gap="sm">
        {columns.map((col) => {
          const cards = byColumn.get(col.key) ?? [];
          return (
            <Paper
              key={col.key}
              withBorder
              p="xs"
              w={260}
              miw={260}
              radius="sm"
            >
              <Group gap={6} mb="xs">
                <Text
                  size="xs"
                  fw={600}
                  px={6}
                  style={{ borderRadius: 4, ...choiceColor(col.color) }}
                >
                  {col.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {cards.length}
                </Text>
              </Group>
              <Stack gap={6}>
                {cards.map((row) => (
                  <Card key={row.id} withBorder padding="xs" radius="sm">
                    <Text size="sm" fw={500}>
                      {(primary && String(row.cells[primary.id] ?? "")) ||
                        t("Untitled")}
                    </Text>
                    {cardProps.map((p) => (
                      <Box key={p.id} mt={4}>
                        <PublicBaseCell
                          prop={p}
                          row={row}
                          references={references}
                        />
                      </Box>
                    ))}
                  </Card>
                ))}
              </Stack>
            </Paper>
          );
        })}
      </Group>
    </ScrollArea>
  );
}
