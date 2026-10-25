import { ReactNode, useCallback, useState } from "react";
import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BaseProperty, BaseRow, BaseView, PropertyType } from "@/features/base/types/base.types";
import { conversionTargets, getPropertyType } from "@/features/base/registry/property-types";
import { useUpdatePropertyMutation } from "@/features/base/queries/base-property-query";
import { useUpdateViewMutation } from "@/features/base/queries/base-view-query";
import { apiErrorMessage } from "@/features/base/utils/errors";
import { conversionOptions, orderWithInserted } from "@/features/base/utils/property-edits";
import { PropertyOptionsModal } from "./property-options-modal";
import { NewPropertyForm } from "./new-property-form";
import { registerOptionsEditors } from "./register-options";

registerOptionsEditors();

export type PropertyMenuAction = "options" | "changeType" | "insertLeft" | "insertRight";

type Dialog =
  | { kind: "options"; propertyId: string }
  | { kind: "changeType"; propertyId: string }
  | { kind: "insert"; propertyId: string; side: "left" | "right" };

function ChangeTypeModal({
  pageId,
  property,
  rows,
  onClose,
}: {
  pageId: string;
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
    <Modal opened onClose={onClose} title={t("Change type of {{name}}", { name: property.name })}>
      <Stack gap="sm">
        <Text size="sm">
          {t("Current type: {{type}}", { type: t(getPropertyType(property.type).label) })}
        </Text>
        <Select
          label={t("New type")}
          allowDeselect={false}
          comboboxProps={{ withinPortal: false }}
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
    </Modal>
  );
}

// Modals opened from the property menu: options, change type, insert.
export function usePropertyDialogs(opts: {
  pageId: string;
  view: BaseView | null;
  properties: BaseProperty[];
  // loaded rows, used to build choices when converting to a choice type
  rows: BaseRow[];
}): { open: (propertyId: string, action: PropertyMenuAction) => void; element: ReactNode } {
  const { t } = useTranslation();
  const { pageId, view, properties, rows } = opts;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const updateView = useUpdateViewMutation(pageId);
  const close = () => setDialog(null);

  const open = useCallback((propertyId: string, action: PropertyMenuAction) => {
    if (action === "options") setDialog({ kind: "options", propertyId });
    else if (action === "changeType") setDialog({ kind: "changeType", propertyId });
    else setDialog({ kind: "insert", propertyId, side: action === "insertLeft" ? "left" : "right" });
  }, []);

  const property = dialog ? properties.find((p) => p.id === dialog.propertyId) ?? null : null;
  let element: ReactNode = null;
  if (dialog && property) {
    if (dialog.kind === "options") {
      element = (
        <PropertyOptionsModal pageId={pageId} property={property} properties={properties} onClose={close} />
      );
    } else if (dialog.kind === "changeType") {
      element = <ChangeTypeModal pageId={pageId} property={property} rows={rows} onClose={close} />;
    } else {
      element = (
        <Modal opened onClose={close} title={t("New property")} size="auto">
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
        </Modal>
      );
    }
  }
  return { open, element };
}
