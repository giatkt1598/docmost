import { useState } from "react";
import { Group, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { searchSuggestions } from "@/features/search/services/search-service";
import { PersonOptions, RefUser } from "@/features/base/types/base.types";
import { CellEditorProps } from "@/features/base/registry/property-types";
import { asStringList, toggleInList } from "@/features/base/utils/cell-values";
import { referencedUser } from "@/features/base/utils/references";
import { useRememberReferences } from "@/features/base/atoms/picked-references-atom";
import { PickerList } from "./picker-list";

// Workspace members through the core search suggestions endpoint.
export function useUserSearch(query: string) {
  const [debounced] = useDebouncedValue(query.trim(), 250);
  return useQuery({
    queryKey: ["base-user-search", debounced],
    queryFn: () =>
      searchSuggestions({ query: debounced, includeUsers: true, limit: 10 }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    select: (res): RefUser[] =>
      (res.users ?? [])
        .filter((u): u is NonNullable<typeof u> => !!u?.id)
        .map((u) => ({ id: u.id, name: u.name ?? null, avatarUrl: u.avatarUrl ?? null })),
  });
}

export function UserLabel({ user }: { user: RefUser }) {
  const { t } = useTranslation();
  const name = user.name?.trim() || t("Unknown user");
  return (
    <Group gap={6} wrap="nowrap">
      <CustomAvatar avatarUrl={user.avatarUrl ?? undefined} name={name} size={20} />
      <Text size="sm" truncate>
        {name}
      </Text>
    </Group>
  );
}

export function PersonEditor({
  property,
  value,
  references,
  initialInput,
  commit,
  save,
  cancel,
}: CellEditorProps) {
  const { t } = useTranslation();
  const multi = !!(property.typeOptions as PersonOptions | null)?.allowMultiple;
  const [search, setSearch] = useState(initialInput ?? "");
  const [selected, setSelected] = useState(asStringList(value));
  const remember = useRememberReferences();
  const { data: found = [], isFetching } = useUserSearch(search);

  // the people already in the cell come first
  const current = selected
    .map((id) => referencedUser(references, id) ?? { id, name: null, avatarUrl: null })
    .filter((u) => !search.trim() || (u.name ?? "").toLowerCase().includes(search.toLowerCase()));
  const users = [...current, ...found.filter((u) => !selected.includes(u.id))];

  const pick = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (user) remember({ users: [user] });
    if (!multi) {
      commit(selected[0] === id ? null : id, "Enter");
      return;
    }
    const next = toggleInList(selected, id);
    setSelected(next);
    save(next.length ? next : null);
  };

  return (
    <PickerList
      search={search}
      onSearch={setSearch}
      onEscape={cancel}
      loading={isFetching}
      placeholder={t("Search people")}
      items={users.map((u) => ({
        key: u.id,
        label: <UserLabel user={u} />,
        selected: selected.includes(u.id),
      }))}
      onPick={pick}
    />
  );
}
