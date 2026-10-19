import { useEffect, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { Group, MultiSelect, MultiSelectProps, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query.ts";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { IVerificationUser } from "@/features/page-verification/types/page-verification.types";

export const MAX_VERIFIERS = 5;

type Option = {
  value: string;
  label: string;
  email?: string;
  avatarUrl?: string | null;
};

const renderOption: MultiSelectProps["renderOption"] = ({ option }) => (
  <Group gap="sm" wrap="nowrap">
    <CustomAvatar
      avatarUrl={option["avatarUrl"]}
      name={option.label}
      size={28}
    />
    <div>
      <Text size="sm" lineClamp={1}>
        {option.label}
      </Text>
      <Text size="xs" c="dimmed" lineClamp={1}>
        {option["email"]}
      </Text>
    </div>
  </Group>
);

interface VerifierSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  initialUsers?: IVerificationUser[];
  error?: string;
}

export function VerifierSelect({
  value,
  onChange,
  initialUsers = [],
  error,
}: VerifierSelectProps) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState("");
  const [debouncedQuery] = useDebouncedValue(searchValue, 400);
  const { data: users, isLoading } = useWorkspaceMembersQuery({
    query: debouncedQuery,
    limit: 50,
  });
  const [options, setOptions] = useState<Option[]>(() =>
    initialUsers.map((u) => ({
      value: u.id,
      label: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
    })),
  );

  // keep previously seen users so selected values keep their labels
  useEffect(() => {
    if (!users?.items) return;
    setOptions((prev) => {
      const known = new Set(prev.map((o) => o.value));
      const next = users.items
        .filter((u) => !known.has(u.id))
        .map((u) => ({
          value: u.id,
          label: u.name,
          email: u.email,
          avatarUrl: u.avatarUrl,
        }));
      return [...prev, ...next];
    });
  }, [users]);

  return (
    <MultiSelect
      label={t("Verifiers")}
      description={t(
        "People who confirm this page is still accurate. Up to {{max}}.",
        { max: MAX_VERIFIERS },
      )}
      placeholder={value.length < MAX_VERIFIERS ? t("Search for users") : ""}
      data={options}
      value={value}
      onChange={onChange}
      renderOption={renderOption}
      searchable
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      hidePickedOptions
      maxValues={MAX_VERIFIERS}
      nothingFoundMessage={isLoading ? t("Loading...") : t("No user found")}
      error={error}
      comboboxProps={{ withinPortal: true }}
    />
  );
}
