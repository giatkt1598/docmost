import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@mantine/hooks";
import {
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useBaseQuery } from "@/ee/base/queries/base-query";
import { searchBaseRows } from "@/features/base-tools/services/base-tools-service";
import classes from "./base-tools.module.css";

// Finds rows by any value and opens the one picked in the row dialog.
export function BaseQuickSearch({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [opened, setOpened] = useState(false);
  const [term] = useDebouncedValue(value.trim(), 250);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: base } = useBaseQuery(pageId);
  const primary = base?.properties.find((p) => p.isPrimary);

  const { data, isFetching } = useQuery({
    queryKey: ["base-quick-search", pageId, term],
    queryFn: () => searchBaseRows(pageId, term),
    enabled: term.length > 0,
    staleTime: 10_000,
  });

  const openRow = (rowId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("row", rowId);
    next.set("rowBase", pageId);
    setSearchParams(next);
    setOpened(false);
  };

  const rows = data?.items ?? [];
  return (
    <Popover
      opened={opened && term.length > 0}
      onChange={setOpened}
      position="bottom-end"
      width={320}
      shadow="md"
    >
      <Popover.Target>
        <TextInput
          size="xs"
          w={220}
          placeholder={t("Search rows")}
          aria-label={t("Search rows")}
          leftSection={<IconSearch size={14} />}
          rightSection={isFetching ? <Loader size={12} /> : null}
          value={value}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            setOpened(true);
          }}
          onFocus={() => setOpened(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpened(false);
            if (e.key === "Enter" && rows[0]) openRow(rows[0].id);
          }}
        />
      </Popover.Target>
      <Popover.Dropdown p={4}>
        {rows.length === 0 ? (
          <Text size="sm" c="dimmed" p="xs">
            {isFetching ? t("Searching...") : t("No matching rows")}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={320}>
            <Stack gap={0}>
              {rows.map((row) => (
                <UnstyledButton
                  key={row.id}
                  className={classes.result}
                  onClick={() => openRow(row.id)}
                >
                  <Text size="sm" lineClamp={1}>
                    {(primary && String(row.cells[primary.id] ?? "")) ||
                      t("Untitled")}
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
