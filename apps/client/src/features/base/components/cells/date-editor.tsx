import { useState } from "react";
import { Button, Group, Stack } from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { DateOptions } from "@/features/base/types/base.types";
import { CellEditorProps } from "@/features/base/registry/property-types";
import { fromEditorState, toEditorState } from "@/features/base/utils/date-input";

export function DateEditor({ value, property, commit, cancel }: CellEditorProps) {
  const { t } = useTranslation();
  const includeTime = !!(property.typeOptions as DateOptions | null)?.includeTime;
  const [state, setState] = useState(() => toEditorState(value, includeTime));

  const pickDay = (day: string | null) => {
    const next = { ...state, day };
    setState(next);
    // without a time the pick is final
    if (!includeTime) commit(fromEditorState(next, false), "Enter");
  };

  return (
    <Stack
      gap="xs"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") cancel();
      }}
    >
      <DatePicker
        value={state.day}
        onChange={pickDay}
        defaultDate={state.day ?? undefined}
      />
      {includeTime && (
        <TimeInput
          size="xs"
          label={t("Time")}
          value={state.time}
          onChange={(e) => setState({ ...state, time: e.currentTarget.value })}
        />
      )}
      <Group justify="space-between">
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => commit(null, "Enter")}>
          {t("Clear")}
        </Button>
        {includeTime && (
          <Button
            size="compact-xs"
            disabled={!state.day}
            onClick={() => commit(fromEditorState(state, true), "Enter")}
          >
            {t("Save")}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
