import { Autocomplete, Group, Paper, SegmentedControl, Stack, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ClockStyle, DateOptions } from "@/features/base/types/base.types";
import { OptionsEditorProps } from "@/features/base/registry/property-types";
import {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  MAX_DATE_FORMAT_LENGTH,
  RELATIVE_DATE_FORMAT,
} from "@/features/base/utils/date-format";
import { dateFormatIssue, datePreview } from "@/features/base/utils/options-preview";
import { NESTED_COMBOBOX_PROPS } from "@/features/base/components/common/anchored-popover";

// Date display options of date, created time and last edited time.
export function DateOptionsEditor({ typeOptions, onChange }: OptionsEditorProps) {
  const { t, i18n } = useTranslation();
  const opts = (typeOptions ?? {}) as DateOptions;
  const set = (patch: Partial<DateOptions>) => onChange({ ...opts, ...patch });
  const issue = dateFormatIssue(opts.dateFormat);

  return (
    <Stack gap="xs">
      <Autocomplete
        size="xs"
        label={t("Date format")}
        description={t("Tokens: YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm ss A a. Text in [brackets] is kept.")}
        placeholder={DEFAULT_DATE_FORMAT}
        maxLength={MAX_DATE_FORMAT_LENGTH}
        comboboxProps={NESTED_COMBOBOX_PROPS}
        data={DATE_FORMAT_PRESETS.map((p) => ({
          value: p,
          label: p === RELATIVE_DATE_FORMAT ? t("Relative (3 days ago)") : p,
        }))}
        // the suggestions are presets, not a filter of what is typed
        filter={({ options }) => options}
        value={opts.dateFormat ?? ""}
        onChange={(v) => set({ dateFormat: v })}
        error={issue === "too-long" ? t("At most {{count}} characters", { count: MAX_DATE_FORMAT_LENGTH }) : undefined}
      />
      <Switch
        size="sm"
        label={t("Include time")}
        checked={!!opts.includeTime}
        onChange={(e) => set({ includeTime: e.currentTarget.checked })}
      />
      {opts.includeTime && (
        <SegmentedControl
          size="xs"
          data={[
            { value: "24h", label: t("24 hour") },
            { value: "12h", label: t("12 hour") },
          ]}
          value={opts.timeFormat ?? "24h"}
          onChange={(v) => set({ timeFormat: v as ClockStyle })}
        />
      )}
      <Paper withBorder radius="sm" px="sm" py={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {t("Preview")}
          </Text>
          <Text size="sm" aria-live="polite" truncate>
            {datePreview(opts, i18n.language) || "—"}
          </Text>
        </Group>
      </Paper>
    </Stack>
  );
}
