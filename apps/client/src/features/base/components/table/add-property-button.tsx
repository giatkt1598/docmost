import { useState } from "react";
import { ActionIcon, Popover } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty } from "@/features/base/types/base.types";
import { NewPropertyForm } from "@/features/base/components/properties/new-property-form";

type Props = {
  pageId: string;
  properties: BaseProperty[];
  onCreated?: (property: BaseProperty) => void;
};

// "+" header cell.
export function AddPropertyButton({ pageId, properties, onCreated }: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withinPortal shadow="md" trapFocus>
      <Popover.Target>
        <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t("Add property")}
          onClick={() => setOpened((o) => !o)}>
          <IconPlus size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        {opened && (
          <NewPropertyForm
            pageId={pageId}
            properties={properties}
            onCancel={() => setOpened(false)}
            onCreated={(p) => {
              setOpened(false);
              onCreated?.(p);
            }}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
