import { Combobox, TextInput, useCombobox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_DATE_FORMAT,
  MAX_DATE_FORMAT_LENGTH,
  dateFormatSuggestions,
  normalizeDateFormat,
  resolveDateFormatInput,
} from "@/features/base/utils/date-format";
import { NESTED_COMBOBOX_PROPS } from "@/features/base/components/common/anchored-popover";

type Props = {
  value: string | undefined;
  onChange: (format: string) => void;
  description?: string;
  error?: string;
};

// Text input with the format presets as suggestions. A suggestion keeps its
// label in the list but writes its value (for "Relative (3 days ago)" that
// is exactly `relative`) into the input and the data. Typing works too;
// Autocomplete cannot do this, it always writes the label.
export function DateFormatInput({ value, onChange, description, error }: Props) {
  const { t } = useTranslation();
  const combobox = useCombobox();
  const options = dateFormatSuggestions(t("Relative (3 days ago)"));
  // stored values from older versions show as what they mean
  const shown = normalizeDateFormat(value) ?? "";

  return (
    <Combobox
      store={combobox}
      {...NESTED_COMBOBOX_PROPS}
      onOptionSubmit={(v) => {
        onChange(v);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <TextInput
          size="xs"
          label={t("Date format")}
          description={description}
          placeholder={DEFAULT_DATE_FORMAT}
          maxLength={MAX_DATE_FORMAT_LENGTH}
          value={shown}
          error={error}
          onChange={(e) => {
            onChange(resolveDateFormatInput(e.currentTarget.value, options));
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onClick={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {options.map((o) => (
            <Combobox.Option key={o.value} value={o.value} active={o.value === shown}>
              {o.label}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
