import { useState } from "react";
import { ActionIcon, Button, Group, Popover, Select, Stack, TextInput } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { PropertyType } from "@/features/base/types/base.types";
import { PROPERTY_TYPE_LIST, PROPERTY_TYPES } from "@/features/base/registry/property-types";
import { useCreatePropertyMutation } from "@/features/base/queries/base-property-query";

type Props = {
  pageId: string;
  existingNames: string[];
  onCreated?: (propertyId: string) => void;
};

// "+" header cell: name and type of a new property. Formulas are created
// from the property menu, which has the formula editor.
export function AddPropertyButton({ pageId, existingNames, onCreated }: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const create = useCreatePropertyMutation(pageId);
  const taken = existingNames.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || taken) return;
    const property = await create.mutateAsync({
      name: trimmed,
      type,
      typeOptions: PROPERTY_TYPES[type].defaultTypeOptions(),
    });
    setOpened(false);
    setName("");
    setType("text");
    onCreated?.(property.id);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withinPortal shadow="md" trapFocus>
      <Popover.Target>
        <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t("Add property")}
          onClick={() => setOpened((o) => !o)}>
          <IconPlus size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={240} onKeyDown={(e) => e.stopPropagation()}>
          <TextInput
            size="xs"
            label={t("Name")}
            data-autofocus
            value={name}
            maxLength={100}
            error={taken ? t("A property with this name already exists") : undefined}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Select
            size="xs"
            label={t("Type")}
            allowDeselect={false}
            comboboxProps={{ withinPortal: false }}
            data={PROPERTY_TYPE_LIST.filter((d) => d.type !== "formula").map((d) => ({
              value: d.type,
              label: t(d.label),
            }))}
            value={type}
            onChange={(v) => v && setType(v as PropertyType)}
          />
          <Group justify="flex-end">
            <Button size="compact-sm" onClick={submit} loading={create.isPending}
              disabled={!name.trim() || taken}>
              {t("Create")}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
