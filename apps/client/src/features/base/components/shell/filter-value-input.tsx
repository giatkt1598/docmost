import { MultiSelect, NumberInput, Select, TextInput } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import {
  BaseProperty,
  ChoiceOptions,
  DateFilterArg,
  DAY_RANGE_PRESETS,
  FilterCondition,
  RELATIVE_DAY_PRESETS,
} from "@/features/base/types/base.types";
import { filterValueKind } from "@/features/base/registry/filter-operators";
import { orderedChoices } from "@/features/base/utils/choice-colors";
import { useState } from "react";
import { useUserSearch } from "@/features/base/components/cells/person-editor";
import { usePageSearch } from "@/features/base/components/cells/page-editor";

// i18n keys of the date presets
export const DATE_PRESET_LABELS: Record<string, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  yesterday: "Yesterday",
  oneWeekAgo: "One week ago",
  oneWeekFromNow: "One week from now",
  oneMonthAgo: "One month ago",
  oneMonthFromNow: "One month from now",
  pastWeek: "Past week",
  pastMonth: "Past month",
  pastYear: "Past year",
  thisWeek: "This week",
  thisMonth: "This month",
  thisYear: "This year",
  nextWeek: "Next week",
  nextMonth: "Next month",
  nextYear: "Next year",
};

type Props = {
  property: BaseProperty;
  condition: FilterCondition;
  onChange: (value: unknown) => void;
};

function UsersValue({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { data: users = [] } = useUserSearch(search);
  const [known, setKnown] = useState<Record<string, string>>({});
  const data = [
    ...value.map((id) => ({ value: id, label: known[id] ?? id })),
    ...users
      .filter((u) => !value.includes(u.id))
      .map((u) => ({ value: u.id, label: u.name?.trim() || t("Unknown user") })),
  ];
  return (
    <MultiSelect
      size="xs"
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      data={data}
      value={value}
      placeholder={t("Select people")}
      onChange={(ids) => {
        const names = Object.fromEntries(data.map((d) => [d.value, d.label]));
        setKnown((k) => ({ ...k, ...names }));
        onChange(ids);
      }}
      comboboxProps={{ withinPortal: false }}
      style={{ flex: 1 }}
    />
  );
}

function PageValue({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { data: pages = [] } = usePageSearch(search);
  const [known, setKnown] = useState<Record<string, string>>({});
  const data = [
    ...(value && !pages.some((p) => p.id === value)
      ? [{ value, label: known[value] ?? t("Selected page") }]
      : []),
    ...pages.map((p) => ({ value: p.id, label: p.title?.trim() || t("Untitled") })),
  ];
  return (
    <Select
      size="xs"
      style={{ flex: 1 }}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      data={data}
      value={value || null}
      placeholder={t("Search pages")}
      comboboxProps={{ withinPortal: false }}
      onChange={(id) => {
        const label = data.find((d) => d.value === id)?.label;
        if (id && label) setKnown((k) => ({ ...k, [id]: label }));
        onChange(id ?? "");
      }}
    />
  );
}

function DateValue({ value, onChange, rangeOnly }: { value: DateFilterArg | undefined; onChange: (v: DateFilterArg) => void; rangeOnly: boolean }) {
  const { t } = useTranslation();
  const mode = rangeOnly ? "range" : value?.mode ?? "relative";
  const modeSelect = !rangeOnly && (
    <Select
      size="xs"
      w={110}
      data={[
        { value: "relative", label: t("Relative") },
        { value: "exact", label: t("Exact date") },
        { value: "range", label: t("Date range") },
      ]}
      value={mode}
      allowDeselect={false}
      comboboxProps={{ withinPortal: false }}
      onChange={(m) => {
        if (m === "exact") onChange({ mode: "exact", date: new Date().toISOString().slice(0, 10) });
        else if (m === "range") onChange({ mode: "range", preset: "thisWeek" });
        else onChange({ mode: "relative", preset: "today" });
      }}
    />
  );
  let input;
  if (mode === "exact") {
    input = (
      <DateInput
        size="xs"
        style={{ flex: 1 }}
        value={value?.mode === "exact" ? value.date : null}
        valueFormat="YYYY-MM-DD"
        popoverProps={{ withinPortal: false }}
        onChange={(d) => d && onChange({ mode: "exact", date: String(d).slice(0, 10) })}
      />
    );
  } else {
    const presets = mode === "range" ? DAY_RANGE_PRESETS : RELATIVE_DAY_PRESETS;
    input = (
      <Select
        size="xs"
        style={{ flex: 1 }}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        data={presets.map((p) => ({ value: p, label: t(DATE_PRESET_LABELS[p]) }))}
        value={value && "preset" in value ? value.preset : presets[0]}
        onChange={(p) => p && onChange({ mode, preset: p } as DateFilterArg)}
      />
    );
  }
  return (
    <>
      {modeSelect}
      {input}
    </>
  );
}

// Value input of a filter condition, by property type and operator.
export function FilterValueInput({ property, condition, onChange }: Props) {
  const { t } = useTranslation();
  const kind = filterValueKind(property, condition.op);
  const v = condition.value;

  switch (kind) {
    case "none":
      return null;
    case "number":
      return (
        <NumberInput
          size="xs"
          style={{ flex: 1 }}
          value={typeof v === "number" || typeof v === "string" ? (v as number | string) : ""}
          onChange={(n) => onChange(n)}
          placeholder={t("Value")}
        />
      );
    case "boolean":
      return (
        <Select
          size="xs"
          style={{ flex: 1 }}
          allowDeselect={false}
          comboboxProps={{ withinPortal: false }}
          data={[
            { value: "true", label: t("Checked") },
            { value: "false", label: t("Unchecked") },
          ]}
          value={v === false ? "false" : "true"}
          onChange={(s) => onChange(s === "true")}
        />
      );
    case "date":
    case "dateRange":
      return (
        <DateValue
          value={v as DateFilterArg | undefined}
          onChange={onChange}
          rangeOnly={kind === "dateRange"}
        />
      );
    case "choice":
    case "choices": {
      const data = orderedChoices(property.typeOptions as ChoiceOptions).map((c) => ({
        value: c.id,
        label: c.name || t("Untitled"),
      }));
      if (kind === "choice") {
        return (
          <Select
            size="xs"
            style={{ flex: 1 }}
            data={data}
            searchable
            comboboxProps={{ withinPortal: false }}
            value={typeof v === "string" && v ? v : null}
            onChange={(id) => onChange(id ?? "")}
            placeholder={t("Select an option")}
          />
        );
      }
      return (
        <MultiSelect
          size="xs"
          style={{ flex: 1 }}
          data={data}
          searchable
          comboboxProps={{ withinPortal: false }}
          value={Array.isArray(v) ? (v as string[]) : []}
          onChange={onChange}
          placeholder={t("Select options")}
        />
      );
    }
    case "page":
      return <PageValue value={typeof v === "string" ? v : ""} onChange={onChange} />;
    case "users":
      return <UsersValue value={Array.isArray(v) ? (v as string[]) : []} onChange={onChange} />;
    default:
      return (
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          value={typeof v === "string" ? v : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={t("Value")}
        />
      );
  }
}
