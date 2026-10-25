import { useState } from "react";
import { ActionIcon, Button, Group, Menu, Popover, TextInput } from "@mantine/core";
import {
  IconArrowsSort,
  IconDots,
  IconDownload,
  IconFilter,
  IconPlus,
  IconSearch,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseView, RowFilter, SortRule } from "@/features/base/types/base.types";
import { countConditions } from "@/features/base/utils/filter-tree";
import { FilterEditor } from "./filter-editor";
import { SortEditor } from "./sort-editor";
import { ColumnsMenu } from "./columns-menu";
import { CsvImportModal } from "./csv-import-modal";
import { KanbanSettings } from "@/features/base/components/kanban/kanban-settings";

type Props = {
  pageId: string;
  view: BaseView;
  properties: BaseProperty[];
  editable: boolean;
  filter: RowFilter | null;
  sorts: SortRule[] | null;
  onFilterChange: (filter: RowFilter | null) => void;
  onSortsChange: (sorts: SortRule[] | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
  onExport: () => void;
  exporting: boolean;
  onNewRow: () => void;
  creatingRow: boolean;
};

export function BaseToolbar(props: Props) {
  const { t } = useTranslation();
  const { pageId, view, properties, editable, filter, sorts } = props;
  const [importOpen, setImportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(!!props.search);
  const filterCount = countConditions(filter);
  const sortCount = sorts?.length ?? 0;

  return (
    <Group gap={4} wrap="nowrap" justify="flex-end">
      {searchOpen ? (
        <TextInput
          size="xs"
          w={200}
          autoFocus
          leftSection={<IconSearch size={14} />}
          placeholder={t("Search rows")}
          value={props.search}
          onChange={(e) => props.onSearchChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              props.onSearchChange("");
              setSearchOpen(false);
            }
          }}
          rightSection={
            <ActionIcon size="xs" variant="subtle" color="gray" aria-label={t("Clear search")}
              onClick={() => {
                props.onSearchChange("");
                setSearchOpen(false);
              }}>
              <IconX size={12} />
            </ActionIcon>
          }
        />
      ) : (
        <ActionIcon variant="subtle" color="gray" aria-label={t("Search rows")} onClick={() => setSearchOpen(true)}>
          <IconSearch size={16} />
        </ActionIcon>
      )}

      <Popover position="bottom-end" withinPortal shadow="md" trapFocus={false}>
        <Popover.Target>
          <Button size="compact-sm" variant="subtle" color={filterCount ? undefined : "gray"}
            leftSection={<IconFilter size={14} />}>
            {filterCount ? t("{{count}} filters", { count: filterCount }) : t("Filter")}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <FilterEditor filter={filter} properties={properties} onChange={props.onFilterChange} />
        </Popover.Dropdown>
      </Popover>

      {view.type !== "kanban" && (
      <Popover position="bottom-end" withinPortal shadow="md" trapFocus={false}>
        <Popover.Target>
          <Button size="compact-sm" variant="subtle" color={sortCount ? undefined : "gray"}
            leftSection={<IconArrowsSort size={14} />}>
            {sortCount ? t("{{count}} sorts", { count: sortCount }) : t("Sort")}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <SortEditor sorts={sorts} properties={properties} onChange={props.onSortsChange} />
        </Popover.Dropdown>
      </Popover>
      )}

      {view.type === "kanban" ? (
        <KanbanSettings pageId={pageId} view={view} properties={properties} editable={editable} />
      ) : (
        <ColumnsMenu pageId={pageId} view={view} properties={properties} editable={editable} />
      )}

      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label={t("More")} loading={props.exporting}>
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconDownload size={14} />} onClick={props.onExport}>
            {t("Export CSV")}
          </Menu.Item>
          {editable && (
            <Menu.Item leftSection={<IconUpload size={14} />} onClick={() => setImportOpen(true)}>
              {t("Import CSV")}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>

      {editable && (
        <Button size="compact-sm" leftSection={<IconPlus size={14} />} onClick={props.onNewRow}
          loading={props.creatingRow}>
          {t("New row")}
        </Button>
      )}

      {editable && (
        <CsvImportModal pageId={pageId} opened={importOpen} onClose={() => setImportOpen(false)} />
      )}
    </Group>
  );
}
