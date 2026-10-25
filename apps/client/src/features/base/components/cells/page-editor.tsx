import { useState } from "react";
import { Group, Text } from "@mantine/core";
import { IconFileText } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { searchSuggestions } from "@/features/search/services/search-service";
import { RefPage } from "@/features/base/types/base.types";
import { CellEditorProps } from "@/features/base/registry/property-types";
import { asStringList } from "@/features/base/utils/cell-values";
import { referencedPage } from "@/features/base/utils/references";
import { useRememberReferences } from "@/features/base/atoms/picked-references-atom";
import { PickerList } from "./picker-list";

export function usePageSearch(query: string) {
  const [debounced] = useDebouncedValue(query.trim(), 250);
  return useQuery({
    queryKey: ["base-page-search", debounced],
    queryFn: () =>
      searchSuggestions({ query: debounced, includePages: true, limit: 10 }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    select: (res): RefPage[] =>
      (res.pages ?? [])
        .filter((p): p is NonNullable<typeof p> => !!p?.id)
        .map((p: any) => ({
          id: p.id,
          slugId: p.slugId,
          title: p.title ?? null,
          icon: p.icon ?? null,
          spaceId: p.spaceId,
          space: p.space?.slug
            ? { id: p.space.id ?? p.spaceId, slug: p.space.slug, name: p.space.name ?? "" }
            : null,
        })),
  });
}

function PageLabel({ page }: { page: RefPage }) {
  const { t } = useTranslation();
  return (
    <Group gap={6} wrap="nowrap">
      {page.icon ? <span>{page.icon}</span> : <IconFileText size={14} />}
      <Text size="sm" truncate>
        {page.title?.trim() || t("Untitled")}
      </Text>
    </Group>
  );
}

export function PageEditor({ value, references, initialInput, commit, cancel }: CellEditorProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState(initialInput ?? "");
  const remember = useRememberReferences();
  const { data: found = [], isFetching } = usePageSearch(search);
  const currentId = asStringList(value)[0];
  const current = currentId ? referencedPage(references, currentId) : null;
  const pages = current && !search.trim()
    ? [current, ...found.filter((p) => p.id !== current.id)]
    : found;

  return (
    <PickerList
      search={search}
      onSearch={setSearch}
      onEscape={cancel}
      loading={isFetching}
      placeholder={t("Search pages")}
      items={pages.map((p) => ({
        key: p.id,
        label: <PageLabel page={p} />,
        selected: p.id === currentId,
      }))}
      onPick={(id) => {
        const page = pages.find((p) => p.id === id);
        if (page) remember({ pages: [page] });
        commit(id === currentId ? null : id, "Enter");
      }}
    />
  );
}
