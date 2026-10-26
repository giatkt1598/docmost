import { ReactNode, useEffect, useMemo, useState } from "react";
import { Box, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { RowQuery } from "@/features/base/types/base.types";
import { useBaseInfoQuery } from "@/features/base/queries/base-query";
import {
  useCreateRowMutation,
  useExportCsvMutation,
} from "@/features/base/queries/base-row-query";
import { useUpdateViewMutation } from "@/features/base/queries/base-view-query";
import { useBaseRealtime } from "@/features/base/hooks/use-base-realtime";
import { useActiveView } from "@/features/base/hooks/use-active-view";
import { useViewDraft } from "@/features/base/hooks/use-view-draft";
import { sortByPosition } from "@/features/base/utils/position";
import { pruneFilter } from "@/features/base/utils/filter-tree";
import { pruneSorts } from "@/features/base/utils/sort-rules";
import { insertIntoView } from "@/features/base/utils/cell-values";
import { registerCellComponents } from "@/features/base/components/cells/register-cells";
import { TableView } from "@/features/base/components/table/table-view";
import { ViewTabs } from "./view-tabs";
import { RowDetailModal } from "@/features/base/components/row-detail/row-detail-modal";
import { BaseToolbar } from "./base-toolbar";
import { DraftBanner } from "./draft-banner";
import { KanbanView } from "@/features/base/components/kanban/kanban-view";

registerCellComponents();

type Props = {
  pageId: string;
  // the surrounding page allows editing (the base permissions apply too)
  editable: boolean;
  // shown above the view tabs (the page title)
  title?: ReactNode;
  // rendered inside a document instead of on its own page
  embedded?: boolean;
  // fill the parent's height; the view scrolls inside (sticky table header)
  fill?: boolean;
  // reports the "Full width" setting of the active view, so the component
  // that owns the width of the box around the workspace can follow it
  onFullWidthChange?: (fullWidth: boolean) => void;
};

// A base with its view tabs, toolbar and the active view.
export function BaseWorkspace({
  pageId,
  editable,
  title,
  embedded = false,
  fill = false,
  onFullWidthChange,
}: Props) {
  const { t } = useTranslation();
  useBaseRealtime(pageId);
  const { data: base, isLoading, isError } = useBaseInfoQuery(pageId);
  const properties = useMemo(
    () => sortByPosition(base?.properties ?? []),
    [base?.properties],
  );
  const views = useMemo(() => sortByPosition(base?.views ?? []), [base?.views]);
  const [view, selectView] = useActiveView(views, embedded);
  const canEdit = editable && base?.permissions?.canEdit !== false;

  // tell the owner of the surrounding box what the active view wants
  const viewWantsFullWidth = view?.config?.fullWidth === true;
  useEffect(() => {
    onFullWidthChange?.(viewWantsFullWidth);
  }, [view?.id, viewWantsFullWidth, onFullWidthChange]);

  const draft = useViewDraft(view);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);

  const query: RowQuery = useMemo(
    () => ({
      filter: pruneFilter(draft.filter, properties),
      sorts: pruneSorts(draft.sorts, properties),
      search: debouncedSearch,
    }),
    [draft.filter, draft.sorts, properties, debouncedSearch],
  );

  const createRow = useCreateRowMutation(pageId);
  const exportCsv = useExportCsvMutation(pageId);
  const updateView = useUpdateViewMutation(pageId);

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  if (isError || !base) {
    return (
      <Box p="md">
        <Text c="dimmed">{t("You don't have access to this base.")}</Text>
      </Box>
    );
  }

  const newRow = async () => {
    const row = await createRow.mutateAsync({ insert: insertIntoView(query) });
    setFocusRowId(row.id);
  };

  const saveDraft = () => {
    if (!view) return;
    const patch = draft.savePatch();
    if (!patch) return;
    updateView.mutate(
      {
        viewId: view.id,
        config: {
          filter: patch.filter
            ? (pruneFilter(patch.filter, properties) ?? null)
            : null,
          sorts: patch.sorts
            ? (pruneSorts(patch.sorts, properties) ?? null)
            : null,
        },
      },
      { onSuccess: () => draft.reset() },
    );
  };

  return (
    <Stack
      gap={0}
      style={{
        minWidth: 0,
        maxWidth: "100%",
        ...(fill ? { flex: 1, height: "100%", minHeight: 0 } : {}),
      }}
      onKeyDown={embedded ? (e) => e.stopPropagation() : undefined}
    >
      {title}
      <Group justify="space-between" wrap="nowrap" gap="sm" py={6}>
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ViewTabs
            pageId={pageId}
            views={views}
            properties={properties}
            activeId={view?.id ?? null}
            onSelect={selectView}
            editable={canEdit}
          />
        </Group>
        {view && (
          <div style={{ flexShrink: 0 }}>
            <BaseToolbar
              pageId={pageId}
              view={view}
              properties={properties}
              editable={canEdit}
              filter={draft.filter}
              sorts={draft.sorts}
              onFilterChange={draft.setFilter}
              onSortsChange={draft.setSorts}
              search={search}
              onSearchChange={setSearch}
              onExport={() => exportCsv.mutate(query.filter)}
              exporting={exportCsv.isPending}
              onNewRow={newRow}
              creatingRow={createRow.isPending}
            />
          </div>
        )}
      </Group>
      {draft.hasDraft && (
        <DraftBanner
          canSave={canEdit}
          saving={updateView.isPending}
          onReset={draft.reset}
          onSave={saveDraft}
        />
      )}
      {!view ? (
        <Text c="dimmed" p="md">
          {t("This base has no views.")}
        </Text>
      ) : view.type === "kanban" ? (
        <KanbanView
          pageId={pageId}
          view={view}
          properties={properties}
          filter={query.filter}
          search={debouncedSearch}
          editable={canEdit}
          fill={fill}
        />
      ) : (
        <TableView
          pageId={pageId}
          view={view}
          properties={properties}
          query={query}
          editable={canEdit}
          focusRowId={focusRowId}
          onFocusHandled={() => setFocusRowId(null)}
          fill={fill}
        />
      )}
      <RowDetailModal
        pageId={pageId}
        view={view}
        properties={properties}
        query={query}
        editable={canEdit}
      />
    </Stack>
  );
}
