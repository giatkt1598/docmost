import { ReactNode, useCallback, useState } from "react";
import { Alert, Button, Group, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseRow, BaseView, PropertyType } from "@/features/base/types/base.types";
import { conversionTargets, getPropertyType } from "@/features/base/registry/property-types";
import { useUpdatePropertyMutation } from "@/features/base/queries/base-property-query";
import { useUpdateViewMutation } from "@/features/base/queries/base-view-query";
import { apiErrorMessage } from "@/features/base/utils/errors";
import { conversionOptions, orderWithInserted } from "@/features/base/utils/property-edits";
import { PropertyOptionsPopover } from "./property-options-popover";
import { NewPropertyForm } from "./new-property-form";
import { registerOptionsEditors } from "./register-options";
import {
  AnchoredPopover,
  NESTED_COMBOBOX_PROPS,
} from "@/features/base/components/common/anchored-popover";

registerOptionsEditors();

export type PropertyMenuAction = "options" | "changeType" | "insertLeft" | "insertRight";

type Dialog = (
  | { kind: "options"; propertyId: string }
  | { kind: "changeType"; propertyId: string }
  | { kind: "insert"; propertyId: string; side: "left" | "right" }
) & {
  // element the popover opens at (the column header)
  anchor: HTMLElement | null;
};

function ChangeTypePopover({
  pageId,
  anchor,
  property,
  rows,
  onClose,
}: {
  pageId: string;
  anchor: HTMLElement | null;
  property: BaseProperty;
  rows: BaseRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const targets = conversionTargets(property);
  const [type, setType] = useState<PropertyType | null>(targets[0]?.type ?? null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdatePropertyMutation(pageId);

  const convert = async () => {
    if (!type) return;
    setError(null);
    try {
      const res = await update.mutateAsync({
        propertyId: property.id,
        type,
        typeOptions: conversionOptions(property, type, rows),
      });
      if (res.jobId) {
        notifications.show({ message: t("The conversion continues in the background.") });
      }
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e) ?? t("Failed to update property"));
    }
  };

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose}>
      <Stack gap="sm" w={320} maw="calc(100vw - 32px)">
        <Text size="sm" fw={600} truncate>
          {t("Change type of {{name}}", { name: property.name })}
        </Text>
        <Text size="sm">
          {t("Current type: {{type}}", { type: t(getPropertyType(property.type).label) })}
        </Text>
        <Select
          label={t("New type")}
          allowDeselect={false}
          comboboxProps={NESTED_COMBOBOX_PROPS}
          data={targets.map((d) => ({ value: d.type, label: t(d.label) }))}
          value={type}
          onChange={(v) => setType(v as PropertyType)}
        />
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          {t("Values that do not fit the new type are cleared. This cannot be undone.")}
        </Alert>
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button color="red" onClick={convert} loading={update.isPending} disabled={!type}>
            {t("Convert")}
          </Button>
        </Group>
      </Stack>
    </AnchoredPopover>
  );
}

// Modals opened from the property menu: options, change type, insert.
export function usePropertyDialogs(opts: {
  pageId: string;
  view: BaseView | null;
  properties: BaseProperty[];
  // loaded rows, used to build choices when converting to a choice type
  rows: BaseRow[];
}): {
  // anchor: the element to open at (column header, toolbar button)
  open: (propertyId: string, action: PropertyMenuAction, anchor: HTMLElement | null) => void;
  element: ReactNode;
} {
  const { t } = useTranslation();
  const { pageId, view, properties, rows } = opts;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const updateView = useUpdateViewMutation(pageId);
  const close = () => setDialog(null);

  const open = useCallback(
    (propertyId: string, action: PropertyMenuAction, anchor: HTMLElement | null) => {
      if (action === "options") setDialog({ kind: "options", propertyId, anchor });
      else if (action === "changeType") setDialog({ kind: "changeType", propertyId, anchor });
      else {
        setDialog({
          kind: "insert",
          propertyId,
          side: action === "insertLeft" ? "left" : "right",
          anchor,
        });
      }
    },
    [],
  );

  const property = dialog ? properties.find((p) => p.id === dialog.propertyId) ?? null : null;
  let element: ReactNode = null;
  if (dialog && property) {
    if (dialog.kind === "options") {
      element = (
        <PropertyOptionsPopover
          pageId={pageId}
          anchor={dialog.anchor}
          property={property}
          properties={properties}
          onClose={close}
        />
      );
    } else if (dialog.kind === "changeType") {
      element = (
        <ChangeTypePopover
          pageId={pageId}
          anchor={dialog.anchor}
          property={property}
          rows={rows}
          onClose={close}
        />
      );
    } else {
      element = (
        <AnchoredPopover anchor={dialog.anchor} onClose={close}>
          <Text size="sm" fw={600} mb="xs">
            {t("New property")}
          </Text>
          <NewPropertyForm
            pageId={pageId}
            properties={properties}
            onCancel={close}
            onCreated={(created) => {
              close();
              if (!view) return;
              updateView.mutate({
                viewId: view.id,
                config: {
                  propertyOrder: orderWithInserted(
                    properties,
                    view.config.propertyOrder,
                    property.id,
                    dialog.side,
                    created.id,
                  ),
                },
              });
            }}
          />
        </AnchoredPopover>
      );
    }
  }
  return { open, element };
}
