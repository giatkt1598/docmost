import { useEffect, useState } from "react";
import { Alert, Button, Divider, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  BaseProperty,
  ChoiceOptions,
  DateOptions,
  FormulaOptions,
  PropertyOptions,
} from "@/features/base/types/base.types";
import { getPropertyType, getPropertyTypeComponents } from "@/features/base/registry/property-types";
import { useUpdatePropertyMutation } from "@/features/base/queries/base-property-query";
import { apiErrorMessage } from "@/features/base/utils/errors";
import { choiceListIssues } from "@/features/base/utils/choice-edits";
import { cleanDateOptions, dateFormatIssue } from "@/features/base/utils/options-preview";
import { DATE_TYPES, optionsToSave } from "@/features/base/utils/property-edits";
import { AnchoredPopover } from "@/features/base/components/common/anchored-popover";
import { FormulaEditor } from "./formula-editor";
import { NumberOptionsEditor } from "./number-options";
import { DateOptionsEditor } from "./date-options";

type Props = {
  pageId: string;
  // header cell (or button) the popover opens at
  anchor: HTMLElement | null;
  property: BaseProperty | null;
  properties: BaseProperty[];
  onClose: () => void;
};

export function PropertyOptionsPopover({ pageId, anchor, property, properties, onClose }: Props) {
  const { t } = useTranslation();
  const update = useUpdatePropertyMutation(pageId);
  const [draft, setDraft] = useState<PropertyOptions>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft((property?.typeOptions ?? {}) as PropertyOptions);
    setError(null);
  }, [property?.id]);

  if (!property) return null;
  const def = getPropertyType(property.type);
  const Editor = getPropertyTypeComponents(property.type).OptionsEditor;
  const isFormula = property.type === "formula";
  const formula = draft as FormulaOptions;
  const resultType = (property.typeOptions as FormulaOptions | null)?.resultType;

  let blocker: string | null = null;
  if (property.type === "select" || property.type === "status" || property.type === "multiSelect") {
    const issue = choiceListIssues(draft as ChoiceOptions);
    if (issue === "empty-name") blocker = t("Every option needs a name");
    if (issue === "duplicate-name") blocker = t("Two options have the same name");
  }
  if (DATE_TYPES.has(property.type) && dateFormatIssue((draft as DateOptions).dateFormat)) {
    blocker = t("The date format is too long");
  }
  if (isFormula && !formula.source?.trim()) blocker = t("The formula is empty");

  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync({ propertyId: property.id, typeOptions: optionsToSave(property.type, draft) });
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e) ?? t("Failed to update property"));
    }
  };

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose}>
      <Stack gap="sm" w={isFormula ? 480 : 340} maw="calc(100vw - 32px)">
        <div>
          <Text size="sm" fw={600} truncate>
            {t("{{name}} options", { name: property.name })}
          </Text>
          <Text size="xs" c="dimmed">
            {t(def.label)}
          </Text>
        </div>
        {property.pendingType && (
          <Alert color="yellow" variant="light">
            {t("This property is being converted. Try again when it is done.")}
          </Alert>
        )}
        {isFormula ? (
          <>
            <FormulaEditor
              source={formula.source ?? ""}
              onChange={(source) => setDraft({ ...formula, source })}
              properties={properties.filter((p) => p.id !== property.id)}
              error={error}
              autoFocus
            />
            {(resultType === "number" || resultType === "date") && (
              <>
                <Divider label={t("Display")} labelPosition="left" />
                {resultType === "number" ? (
                  <NumberOptionsEditor
                    property={property}
                    typeOptions={(formula.formatOptions ?? {}) as PropertyOptions}
                    onChange={(fo) => setDraft({ ...formula, formatOptions: fo as Record<string, unknown> })}
                  />
                ) : (
                  <DateOptionsEditor
                    property={property}
                    typeOptions={(formula.formatOptions ?? {}) as PropertyOptions}
                    onChange={(fo) =>
                      setDraft({ ...formula, formatOptions: cleanDateOptions(fo as DateOptions) as Record<string, unknown> })
                    }
                  />
                )}
              </>
            )}
          </>
        ) : Editor ? (
          <Editor property={property} typeOptions={draft} onChange={setDraft} />
        ) : (
          <Text size="sm" c="dimmed">
            {t("This property has no options.")}
          </Text>
        )}
        {error && !isFormula && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
        )}
        {blocker && (
          <Text size="xs" c="red">
            {blocker}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} loading={update.isPending} disabled={!!blocker || !!property.pendingType}>
            {t("Save")}
          </Button>
        </Group>
      </Stack>
    </AnchoredPopover>
  );
}
