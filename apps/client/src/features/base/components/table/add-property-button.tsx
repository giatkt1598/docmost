import { useState } from "react";
import { ActionIcon } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty } from "@/features/base/types/base.types";
import { AnchoredPopover } from "@/features/base/components/common/anchored-popover";
import { NewPropertyForm } from "@/features/base/components/properties/new-property-form";

type Props = {
  pageId: string;
  properties: BaseProperty[];
  onCreated?: (property: BaseProperty) => void;
};

// "+" header cell.
export function AddPropertyButton({ pageId, properties, onCreated }: Props) {
  const { t } = useTranslation();
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [opened, setOpened] = useState(false);
  return (
    <>
      <ActionIcon
        ref={setButton}
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={t("Add property")}
        aria-expanded={opened}
        onClick={() => setOpened((o) => !o)}
      >
        <IconPlus size={16} />
      </ActionIcon>
      {opened && (
        <AnchoredPopover anchor={button} position="bottom-end" onClose={() => setOpened(false)}>
          <NewPropertyForm
            pageId={pageId}
            properties={properties}
            onCancel={() => setOpened(false)}
            onCreated={(p) => {
              setOpened(false);
              onCreated?.(p);
            }}
          />
        </AnchoredPopover>
      )}
    </>
  );
}
