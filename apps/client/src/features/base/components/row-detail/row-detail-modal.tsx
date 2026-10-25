import { useEffect, useMemo, useState } from "react";
import { ActionIcon, Button, Center, Divider, Group, Loader, Modal, Stack, Textarea, Tooltip } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseView, RowQuery } from "@/features/base/types/base.types";
import {
  useBaseRowQuery,
  useBaseRows,
  useDeleteRowMutation,
  useOpenRowPageMutation,
  useRestoreRowsMutation,
  useUpdateRowMutation,
} from "@/features/base/queries/base-row-query";
import { pickedReferencesAtom } from "@/features/base/atoms/picked-references-atom";
import { withReferences } from "@/features/base/utils/references";
import { apiErrorStatus } from "@/features/base/utils/errors";
import { orderProperties } from "@/features/base/utils/grid-columns";
import { rowNeighbours } from "@/features/base/utils/property-edits";
import { textCellValue } from "@/features/base/utils/cell-values";
import { buildPageUrl } from "@/features/page/page.utils";
import { showUndoToast } from "@/features/base/components/table/selection-bar";
import { PropertyField } from "./property-field";

export const ROW_PARAM = "row";
export const ROW_BASE_PARAM = "rowBase";

type Props = {
  pageId: string;
  view: BaseView | null;
  properties: BaseProperty[];
  // the active view's row list, for previous / next
  query: RowQuery;
  editable: boolean;
};

// Row detail, opened by ?row=<id>&rowBase=<pageId>. Only the base whose id
// is in rowBase opens it.
export function RowDetailModal({ pageId, view, properties, query, editable }: Props) {
  const [params, setParams] = useSearchParams();
  const rowId = params.get(ROW_BASE_PARAM) === pageId ? params.get(ROW_PARAM) : null;

  const setRow = (id: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) {
        next.set(ROW_PARAM, id);
        next.set(ROW_BASE_PARAM, pageId);
      } else {
        next.delete(ROW_PARAM);
        next.delete(ROW_BASE_PARAM);
      }
      return next;
    });

  if (!rowId) return null;
  return (
    <RowDetailBody
      key={rowId}
      pageId={pageId}
      rowId={rowId}
      view={view}
      properties={properties}
      query={query}
      editable={editable}
      onNavigate={setRow}
    />
  );
}

function RowDetailBody({
  pageId,
  rowId,
  view,
  properties,
  query,
  editable,
  onNavigate,
}: Props & { rowId: string; onNavigate: (rowId: string | null) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const clipboard = useClipboard({ timeout: 1000 });
  const { data: row, error, isLoading } = useBaseRowQuery(pageId, rowId);
  // the view's loaded rows (cache only) give previous / next
  const list = useBaseRows(pageId, query, { enabled: false });
  const picked = useAtomValue(pickedReferencesAtom);
  const references = useMemo(() => withReferences(picked, list.references), [picked, list.references]);
  const updateRow = useUpdateRowMutation(pageId);
  const deleteRow = useDeleteRowMutation(pageId);
  const restoreRows = useRestoreRowsMutation(pageId);
  const openPage = useOpenRowPageMutation(pageId);

  const ordered = useMemo(
    () => orderProperties(properties, view?.config.propertyOrder),
    [properties, view?.config.propertyOrder],
  );
  const primary = ordered.find((p) => p.isPrimary) ?? null;
  const fields = ordered.filter((p) => !p.isPrimary);
  const nav = rowNeighbours(list.rows.map((r) => r.id), rowId);

  const [title, setTitle] = useState("");
  const storedTitle = primary && row ? row.cells?.[primary.id] : null;
  useEffect(() => setTitle(typeof storedTitle === "string" ? storedTitle : ""), [storedTitle]);

  useEffect(() => {
    if (apiErrorStatus(error) === 404) {
      notifications.show({ message: t("This row no longer exists.") });
      onNavigate(null);
    }
  }, [error]);

  const save = (propertyId: string, value: unknown) =>
    updateRow.mutate({ rowId, cells: { [propertyId]: value ?? null } });

  const saveTitle = () => {
    if (!primary) return;
    const next = textCellValue(primary.type, title);
    if ((next ?? "") !== (typeof storedTitle === "string" ? storedTitle : "")) save(primary.id, next);
  };

  const copyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(ROW_PARAM, rowId);
    url.searchParams.set(ROW_BASE_PARAM, pageId);
    clipboard.copy(url.toString());
    notifications.show({ message: t("Link copied") });
  };

  const remove = () =>
    deleteRow.mutate(rowId, {
      onSuccess: () => {
        onNavigate(nav.next ?? nav.prev ?? null);
        showUndoToast(t, 1, () => restoreRows.mutate([rowId]));
      },
    });

  const openRowPage = async () => {
    const page = await openPage.mutateAsync(rowId);
    navigate(buildPageUrl(page.spaceSlug ?? undefined, page.slugId, page.title ?? undefined));
  };

  return (
    <Modal
      opened
      onClose={() => onNavigate(null)}
      size="lg"
      title={
        <Group gap={4}>
          <Tooltip label={t("Previous row")} withinPortal>
            <ActionIcon variant="subtle" color="gray" disabled={!nav.prev} aria-label={t("Previous row")}
              onClick={() => nav.prev && onNavigate(nav.prev)}>
              <IconChevronUp size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Next row")} withinPortal>
            <ActionIcon variant="subtle" color="gray" disabled={!nav.next} aria-label={t("Next row")}
              onClick={() => nav.next && onNavigate(nav.next)}>
              <IconChevronDown size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Copy link")} withinPortal>
            <ActionIcon variant="subtle" color="gray" aria-label={t("Copy link")} onClick={copyLink}>
              <IconLink size={16} />
            </ActionIcon>
          </Tooltip>
          {editable && (
            <Tooltip label={t("Delete row")} withinPortal>
              <ActionIcon variant="subtle" color="red" aria-label={t("Delete row")} onClick={remove}
                loading={deleteRow.isPending}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      }
    >
      {isLoading && !row ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : row ? (
        <Stack gap="sm">
          {primary && (
            <Textarea
              variant="unstyled"
              autosize
              minRows={1}
              placeholder={t("Untitled")}
              aria-label={primary.name}
              readOnly={!editable}
              styles={{ input: { fontSize: 24, fontWeight: 600, lineHeight: 1.3 } }}
              value={title}
              maxLength={1000}
              onChange={(e) => setTitle(e.currentTarget.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
          )}
          <Group>
            <Button size="compact-sm" variant="light" leftSection={<IconExternalLink size={14} />}
              onClick={openRowPage} loading={openPage.isPending} disabled={!editable && !row.docPageId}>
              {t("Open row page")}
            </Button>
          </Group>
          <Divider />
          <Stack gap={4}>
            {fields.map((p) => (
              <PropertyField
                key={p.id}
                pageId={pageId}
                property={p}
                row={row}
                references={references}
                editable={editable}
                onSave={save}
              />
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Modal>
  );
}
