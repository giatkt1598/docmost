import { ReactNode, useEffect, useState } from "react";
import { Loader, Text, TextInput } from "@mantine/core";
import { IconCheck, IconPlus, IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./cells.module.css";

export type PickerItem = {
  key: string;
  label: ReactNode;
  selected?: boolean;
};

type Props = {
  search: string;
  onSearch: (value: string) => void;
  items: PickerItem[];
  onPick: (key: string) => void;
  // "Create …" row shown below the items
  createLabel?: string | null;
  onCreate?: () => void;
  onEscape: () => void;
  loading?: boolean;
  placeholder?: string;
  header?: ReactNode;
};

const CREATE_KEY = "\u0000create";

// Search box plus a keyboard-navigable option list, shared by the choice,
// person and page pickers.
export function PickerList({
  search,
  onSearch,
  items,
  onPick,
  createLabel,
  onCreate,
  onEscape,
  loading,
  placeholder,
  header,
}: Props) {
  const { t } = useTranslation();
  const keys = [...items.map((i) => i.key), ...(createLabel ? [CREATE_KEY] : [])];
  const [active, setActive] = useState(0);

  useEffect(() => setActive(0), [search, items.length]);

  const choose = (key: string | undefined) => {
    if (!key) return;
    if (key === CREATE_KEY) onCreate?.();
    else onPick(key);
  };

  return (
    <div style={{ width: 280 }}>
      {header}
      <TextInput
        size="xs"
        autoFocus
        leftSection={<IconSearch size={14} />}
        rightSection={loading ? <Loader size={12} /> : null}
        placeholder={placeholder ?? t("Search")}
        value={search}
        onChange={(e) => onSearch(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(keys.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(keys[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onEscape();
          }
        }}
        mb={6}
      />
      <div className={classes.pickerList} role="listbox">
        {items.map((item, i) => (
          <button
            type="button"
            key={item.key}
            role="option"
            aria-selected={!!item.selected}
            className={classes.pickerOption}
            data-active={i === active || undefined}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(item.key)}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>{item.label}</span>
            {item.selected && <IconCheck size={14} />}
          </button>
        ))}
        {createLabel && (
          <button
            type="button"
            className={classes.pickerOption}
            data-active={active === items.length || undefined}
            onMouseEnter={() => setActive(items.length)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(CREATE_KEY)}
          >
            <IconPlus size={14} />
            <span>{createLabel}</span>
          </button>
        )}
        {!items.length && !createLabel && !loading && (
          <Text size="xs" c="dimmed" px={8} py={4}>
            {t("No results")}
          </Text>
        )}
      </div>
    </div>
  );
}
