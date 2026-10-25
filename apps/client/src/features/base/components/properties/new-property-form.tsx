import { useState } from "react";
import { Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { BaseProperty, PropertyType } from "@/features/base/types/base.types";
import { PROPERTY_TYPE_LIST, PROPERTY_TYPES } from "@/features/base/registry/property-types";
import { useCreatePropertyMutation } from "@/features/base/queries/base-property-query";
import { apiErrorMessage } from "@/features/base/utils/errors";
import { FormulaEditor } from "./formula-editor";

type Props = {
  pageId: string;
  properties: BaseProperty[];
  onCreated: (property: BaseProperty) => void;
  onCancel?: () => void;
};

// Name and type of a new property; a formula gets its source right away,
// because the server compiles it on creation.
export function NewPropertyForm({ pageId, properties, onCreated, onCancel }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreatePropertyMutation(pageId);
  const taken = properties.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const isFormula = type === "formula";
  const ready = !!name.trim() && !taken && (!isFormula || !!source.trim());

  const submit = async () => {
    if (!ready) return;
    setError(null);
    try {
      const property = await create.mutateAsync({
        name: name.trim(),
        type,
        typeOptions: isFormula ? { source } : PROPERTY_TYPES[type].defaultTypeOptions(),
      });
      onCreated(property);
    } catch (e) {
      setError(apiErrorMessage(e) ?? t("Failed to create property"));
    }
  };

  return (
    <Stack gap="xs" w={isFormula ? 480 : 260} maw="calc(100vw - 48px)" onKeyDown={(e) => e.stopPropagation()}>
      <TextInput
        size="xs"
        label={t("Name")}
        data-autofocus
        value={name}
        maxLength={100}
        error={taken ? t("A property with this name already exists") : undefined}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && !isFormula && submit()}
      />
      <Select
        size="xs"
        label={t("Type")}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
        data={PROPERTY_TYPE_LIST.map((d) => ({ value: d.type, label: t(d.label) }))}
        value={type}
        onChange={(v) => v && setType(v as PropertyType)}
      />
      {isFormula && (
        <FormulaEditor source={source} onChange={setSource} properties={properties} error={error} />
      )}
      {error && !isFormula && (
        <Text size="xs" c="red" aria-live="polite">
          {error}
        </Text>
      )}
      <Group justify="flex-end" gap="xs">
        {onCancel && (
          <Button size="compact-sm" variant="default" onClick={onCancel}>
            {t("Cancel")}
          </Button>
        )}
        <Button size="compact-sm" onClick={submit} loading={create.isPending} disabled={!ready}>
          {t("Create")}
        </Button>
      </Group>
    </Stack>
  );
}
