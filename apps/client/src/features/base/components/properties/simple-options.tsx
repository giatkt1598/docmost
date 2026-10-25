import { Select, Stack, Switch, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { OptionsOf } from "@/features/base/types/base.types";
import { OptionsEditorProps } from "@/features/base/registry/property-types";

export function PersonOptionsEditor({ typeOptions, onChange }: OptionsEditorProps) {
  const { t } = useTranslation();
  const opts = (typeOptions ?? {}) as OptionsOf<"person">;
  return (
    <Switch
      label={t("Allow multiple people")}
      checked={!!opts.allowMultiple}
      onChange={(e) => onChange({ ...opts, allowMultiple: e.currentTarget.checked })}
    />
  );
}

// Default value of text, long text, url, email and checkbox properties.
export function DefaultValueEditor({ property, typeOptions, onChange }: OptionsEditorProps) {
  const { t } = useTranslation();
  const opts = (typeOptions ?? {}) as { defaultValue?: unknown };
  if (property.type === "checkbox") {
    return (
      <Select
        size="xs"
        label={t("Default value")}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        data={[
          { value: "false", label: t("Unchecked") },
          { value: "true", label: t("Checked") },
        ]}
        value={opts.defaultValue === true ? "true" : "false"}
        onChange={(v) => onChange({ ...opts, defaultValue: v === "true" })}
      />
    );
  }
  return (
    <Stack gap="xs">
      <TextInput
        size="xs"
        label={t("Default value")}
        description={t("New rows start with this value")}
        maxLength={property.type === "longText" ? 25000 : 1000}
        value={typeof opts.defaultValue === "string" ? opts.defaultValue : ""}
        onChange={(e) => onChange({ ...opts, defaultValue: e.currentTarget.value || null })}
      />
    </Stack>
  );
}
