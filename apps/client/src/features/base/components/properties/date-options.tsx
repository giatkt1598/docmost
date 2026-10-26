import { Group, Paper, SegmentedControl, Stack, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ClockStyle, DateOptions } from "@/features/base/types/base.types";
import { OptionsEditorProps } from "@/features/base/registry/property-types";
import { MAX_DATE_FORMAT_LENGTH } from "@/features/base/utils/date-format";
import { dateFormatIssue, datePreview } from "@/features/base/utils/options-preview";
import { DateFormatInput } from "./date-format-input";

// Date display options of date, created time and last edited time.
export function DateOptionsEditor({ typeOptions, onChange }: OptionsEditorProps) {
  const { t, i18n } = useTranslation();
  const opts = (typeOptions ?? {}) as DateOptions;
  const set = (patch: Partial<DateOptions>) => onChange({ ...opts, ...patch });
  const issue = dateFormatIssue(opts.dateFormat);

  return (
    <Stack gap="xs">
      <DateFormatInput
        value={opts.dateFormat}
        onChange={(dateFormat) => set({ dateFormat })}
        description={t("Tokens: YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm ss A a. Text in [brackets] is kept.")}
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
