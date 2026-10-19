import { Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";

// "" stands for a workspace-wide (Global) template.
export const GLOBAL_SCOPE = "";

interface TemplateScopeSelectProps {
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TemplateScopeSelect({
  value,
  onChange,
  disabled,
}: TemplateScopeSelectProps) {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });

  const data = [
    ...(isAdmin || value === GLOBAL_SCOPE
      ? [
          {
            group: t("Workspace"),
            items: [{ value: GLOBAL_SCOPE, label: t("Global") }],
          },
        ]
      : []),
    {
      group: t("Spaces"),
      items: (spaces?.items ?? []).map((space) => ({
        value: space.id,
        label: space.name,
      })),
    },
  ];

  return (
    <Select
      label={t("Scope")}
      description={t(
        "Global templates are available in every space. Only workspace admins can create them.",
      )}
      placeholder={t("Select scope")}
      data={data}
      value={value}
      onChange={(next) => next !== null && onChange(next)}
      allowDeselect={false}
      disabled={disabled}
      searchable
      comboboxProps={{ withinPortal: true }}
    />
  );
}
