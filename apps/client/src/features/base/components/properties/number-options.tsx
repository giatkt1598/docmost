import { Group, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { NumberOptions, NumberStyle, SeparatorStyle } from "@/features/base/types/base.types";
import { OptionsEditorProps } from "@/features/base/registry/property-types";
import { numberPreview } from "@/features/base/utils/options-preview";
import { NESTED_COMBOBOX_PROPS } from "@/features/base/components/common/anchored-popover";

const FORMATS: Array<{ value: NumberStyle; label: string }> = [
  { value: "plain", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent" },
  { value: "progress", label: "Progress bar" },
];

const SEPARATORS: Array<{ value: SeparatorStyle; label: string }> = [
  { value: "comma_period", label: "1,234.5" },
  { value: "period_comma", label: "1.234,5" },
  { value: "space_comma", label: "1 234,5" },
  { value: "space_period", label: "1 234.5" },
  { value: "none", label: "1234.5" },
  { value: "local", label: "Language default" },
];

export function NumberOptionsEditor({ typeOptions, onChange }: OptionsEditorProps) {
  const { t, i18n } = useTranslation();
  const opts = (typeOptions ?? {}) as NumberOptions;
  const set = (patch: Partial<NumberOptions>) => onChange({ ...opts, ...patch });

  return (
    <Stack gap="xs">
      <SimpleGrid cols={2} spacing="xs">
        <Select
          size="xs"
          label={t("Format")}
          allowDeselect={false}
          comboboxProps={NESTED_COMBOBOX_PROPS}
          data={FORMATS.map((f) => ({ value: f.value, label: t(f.label) }))}
          value={opts.format ?? "plain"}
          onChange={(v) => v && set({ format: v as NumberStyle })}
        />
        <Select
          size="xs"
          label={t("Separators")}
          allowDeselect={false}
          comboboxProps={NESTED_COMBOBOX_PROPS}
          data={SEPARATORS.map((s) => ({ value: s.value, label: s.value === "local" ? t(s.label) : s.label }))}
          value={opts.separators ?? "comma_period"}
          onChange={(v) => v && set({ separators: v as SeparatorStyle })}
        />
        <NumberInput
          size="xs"
          label={t("Decimal places")}
          placeholder={t("Automatic")}
          min={0}
          max={10}
          allowDecimal={false}
          value={opts.precision ?? ""}
          onChange={(v) => set({ precision: typeof v === "number" ? v : undefined })}
        />
        <NumberInput
          size="xs"
          label={t("Default value")}
          value={opts.defaultValue ?? ""}
          onChange={(v) => set({ defaultValue: typeof v === "number" ? v : null })}
        />
        {opts.format === "currency" && (
          <>
            <TextInput
              size="xs"
              label={t("Currency code")}
              placeholder="USD"
              maxLength={8}
              value={opts.currencyCode ?? ""}
              onChange={(e) => set({ currencyCode: e.currentTarget.value.toUpperCase() || undefined })}
            />
            <TextInput
              size="xs"
              label={t("Currency symbol")}
              placeholder="$"
              maxLength={8}
              value={opts.currencySymbol ?? ""}
              onChange={(e) => set({ currencySymbol: e.currentTarget.value || undefined })}
            />
          </>
        )}
      </SimpleGrid>
      <Paper withBorder radius="sm" px="sm" py={6}>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {t("Preview")}
          </Text>
          <Text size="sm" ff="monospace" aria-live="polite">
            {numberPreview(opts, i18n.language)}
          </Text>
        </Group>
      </Paper>
    </Stack>
  );
}
