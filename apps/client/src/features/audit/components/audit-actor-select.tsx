import { useMemo, useState } from "react";
import { Select } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query";

type Props = {
  value: string | null;
  onChange: (actorId: string | null) => void;
};

export function AuditActorSelect({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [query] = useDebouncedValue(search, 300);
  const { data } = useWorkspaceMembersQuery({ limit: 50, query });
  const [selected, setSelected] = useState<{
    value: string;
    label: string;
  } | null>(null);

  const options = useMemo(() => {
    const members = (data?.items ?? []).map((member) => ({
      value: member.id,
      label: member.name || member.email,
    }));
    // keep the choice showing when a new search no longer returns it
    return selected && !members.some((m) => m.value === selected.value)
      ? [selected, ...members]
      : members;
  }, [data, selected]);

  return (
    <Select
      label={t("Actor")}
      placeholder={t("All actors")}
      data={options}
      value={value}
      onChange={(next, option) => {
        setSelected(next ? (option as typeof selected) : null);
        onChange(next as string | null);
      }}
      onSearchChange={setSearch}
      searchValue={search}
      clearable
      searchable
      filter={({ options }) => options}
      w={220}
    />
  );
}
