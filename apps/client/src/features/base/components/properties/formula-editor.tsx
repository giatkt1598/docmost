import { useRef, useState } from "react";
import { Alert, Box, Group, ScrollArea, SegmentedControl, Stack, Text, Textarea, TextInput, UnstyledButton } from "@mantine/core";
import { IconAlertTriangle, IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty } from "@/features/base/types/base.types";
import { getPropertyType } from "@/features/base/registry/property-types";
import {
  filterFunctions,
  insertFunction,
  insertProperty,
  InsertResult,
} from "@/features/base/utils/formula-catalog";

type Props = {
  source: string;
  onChange: (source: string) => void;
  // properties the formula may read (the formula itself excluded)
  properties: BaseProperty[];
  error?: string | null;
  autoFocus?: boolean;
};

const MAX_SOURCE = 4000;

// Source editor with clickable property and function lists.
export function FormulaEditor({ source, onChange, properties, error, autoFocus }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"properties" | "functions">("properties");
  const [query, setQuery] = useState("");

  const apply = (fn: (s: string, a: number, b: number) => InsertResult) => {
    const el = ref.current;
    const start = el?.selectionStart ?? source.length;
    const end = el?.selectionEnd ?? source.length;
    const { value, caret } = fn(source, start, end);
    onChange(value.slice(0, MAX_SOURCE));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const q = query.trim().toLowerCase();
  const props = properties.filter((p) => !q || p.name.toLowerCase().includes(q));
  const fns = filterFunctions(query);

  return (
    <Stack gap="xs">
      <Textarea
        ref={ref}
        autoFocus={autoFocus}
        label={t("Formula")}
        placeholder={'prop("Price") * prop("Quantity")'}
        autosize
        minRows={3}
        maxRows={10}
        maxLength={MAX_SOURCE}
        spellCheck={false}
        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 13 } }}
        value={source}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
          <Text size="sm">{error}</Text>
        </Alert>
      )}
      <Group gap="xs" wrap="nowrap">
        <SegmentedControl
          size="xs"
          data={[
            { value: "properties", label: t("Properties") },
            { value: "functions", label: t("Functions") },
          ]}
          value={tab}
          onChange={(v) => setTab(v as "properties" | "functions")}
        />
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          leftSection={<IconSearch size={12} />}
          placeholder={t("Search")}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </Group>
      <ScrollArea.Autosize mah={200} type="auto">
        <Stack gap={2}>
          {tab === "properties"
            ? props.map((p) => {
                const Icon = getPropertyType(p.type).icon;
                return (
                  <UnstyledButton
                    key={p.id}
                    px={6}
                    py={4}
                    style={{ borderRadius: 4 }}
                    onClick={() => apply((s, a, b) => insertProperty(s, a, b, p.name))}
                  >
                    <Group gap={6} wrap="nowrap">
                      <Icon size={14} />
                      <Text size="sm" truncate>
                        {p.name}
                      </Text>
                    </Group>
                  </UnstyledButton>
                );
              })
            : fns.map((f) => (
                <UnstyledButton
                  key={f.name}
                  px={6}
                  py={4}
                  style={{ borderRadius: 4 }}
                  onClick={() => apply((s, a, b) => insertFunction(s, a, b, f.name))}
                >
                  <Box>
                    <Text size="sm" ff="monospace">
                      {f.signature}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t(f.description)}
                    </Text>
                  </Box>
                </UnstyledButton>
              ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
