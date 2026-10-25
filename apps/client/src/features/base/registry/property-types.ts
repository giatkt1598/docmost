import type { ComponentType, CSSProperties } from "react";
import {
  IconAlignLeft,
  IconCalendar,
  IconCircleChevronDown,
  IconClockEdit,
  IconClockPlus,
  IconFileText,
  IconHash,
  IconLetterT,
  IconLink,
  IconMail,
  IconMathFunction,
  IconPaperclip,
  IconProgressCheck,
  IconSquareCheck,
  IconTags,
  IconUser,
  IconUserEdit,
} from "@tabler/icons-react";
import {
  PROPERTY_TYPE_IDS,
  PropertyType,
  FilterOp,
  BaseProperty,
  BaseRow,
  PersonOptions,
  RowReferenceMap,
  PropertyOptions,
} from "@/features/base/types/base.types";
import { filterOperatorsFor } from "@/features/base/registry/filter-operators";

// Static description of every property type. UI components (cell renderer,
// cell editor, options editor) are attached later with
// registerPropertyTypeComponents(), so this module stays free of React views.

export type PropertyTypeGroup = "text" | "number" | "choice" | "other" | "computed";

// Which options editor a type uses (null: no options).
export type PropertyOptionsKind =
  | "choices"
  | "number"
  | "date"
  | "person"
  | "formula"
  | "default"
  | null;

export type TablerIcon = ComponentType<{
  size?: number | string;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}>;

type PropertyLike = Pick<BaseProperty, "type" | "typeOptions">;

export type PropertyTypeDefinition = {
  type: PropertyType;
  // i18n key
  label: string;
  icon: TablerIcon;
  group: PropertyTypeGroup;
  // users can write cells of this type
  editable: boolean;
  optionsKind: PropertyOptionsKind;
  // the value lives in row.cells (system types read row columns instead)
  storedInCells: boolean;
  // a property can be converted to this type ("change type")
  convertibleTarget: boolean;
  // may be the primary property
  canBePrimary: boolean;
  sortable: (property: PropertyLike) => boolean;
  filterOperators: (property: PropertyLike) => FilterOp[];
  defaultTypeOptions: () => PropertyOptions;
};

const always = () => true;
const never = () => false;

function def(
  d: Omit<
    PropertyTypeDefinition,
    | "sortable"
    | "filterOperators"
    | "storedInCells"
    | "convertibleTarget"
    | "canBePrimary"
    | "defaultTypeOptions"
  > &
    Partial<PropertyTypeDefinition>,
): PropertyTypeDefinition {
  return {
    sortable: always,
    filterOperators: filterOperatorsFor,
    storedInCells: true,
    convertibleTarget: d.editable,
    canBePrimary: false,
    defaultTypeOptions: () => ({}),
    ...d,
  };
}

const choiceDefaults = () => ({ choices: [], choiceOrder: [] });

export const PROPERTY_TYPES: Record<PropertyType, PropertyTypeDefinition> = {
  text: def({
    type: "text",
    label: "Text",
    icon: IconLetterT,
    group: "text",
    editable: true,
    optionsKind: "default",
    canBePrimary: true,
  }),
  longText: def({
    type: "longText",
    label: "Long text",
    icon: IconAlignLeft,
    group: "text",
    editable: true,
    optionsKind: "default",
    canBePrimary: true,
  }),
  number: def({
    type: "number",
    label: "Number",
    icon: IconHash,
    group: "number",
    editable: true,
    optionsKind: "number",
    defaultTypeOptions: () => ({ format: "plain" }),
  }),
  select: def({
    type: "select",
    label: "Select",
    icon: IconCircleChevronDown,
    group: "choice",
    editable: true,
    optionsKind: "choices",
    defaultTypeOptions: choiceDefaults,
  }),
  status: def({
    type: "status",
    label: "Status",
    icon: IconProgressCheck,
    group: "choice",
    editable: true,
    optionsKind: "choices",
    defaultTypeOptions: choiceDefaults,
  }),
  multiSelect: def({
    type: "multiSelect",
    label: "Multi-select",
    icon: IconTags,
    group: "choice",
    editable: true,
    optionsKind: "choices",
    sortable: never,
    defaultTypeOptions: choiceDefaults,
  }),
  date: def({
    type: "date",
    label: "Date",
    icon: IconCalendar,
    group: "other",
    editable: true,
    optionsKind: "date",
  }),
  person: def({
    type: "person",
    label: "Person",
    icon: IconUser,
    group: "other",
    editable: true,
    optionsKind: "person",
    // several people sort as nothing on the server
    sortable: (p) => !(p.typeOptions as PersonOptions)?.allowMultiple,
  }),
  file: def({
    type: "file",
    label: "File",
    icon: IconPaperclip,
    group: "other",
    editable: true,
    optionsKind: null,
    sortable: never,
  }),
  page: def({
    type: "page",
    label: "Page",
    icon: IconFileText,
    group: "other",
    editable: true,
    optionsKind: null,
    // the server refuses to sort page properties
    sortable: never,
  }),
  checkbox: def({
    type: "checkbox",
    label: "Checkbox",
    icon: IconSquareCheck,
    group: "other",
    editable: true,
    optionsKind: "default",
  }),
  url: def({
    type: "url",
    label: "URL",
    icon: IconLink,
    group: "other",
    editable: true,
    optionsKind: "default",
  }),
  email: def({
    type: "email",
    label: "Email",
    icon: IconMail,
    group: "other",
    editable: true,
    optionsKind: "default",
  }),
  createdAt: def({
    type: "createdAt",
    label: "Created time",
    icon: IconClockPlus,
    group: "computed",
    editable: false,
    optionsKind: "date",
    storedInCells: false,
  }),
  lastEditedAt: def({
    type: "lastEditedAt",
    label: "Last edited time",
    icon: IconClockEdit,
    group: "computed",
    editable: false,
    optionsKind: "date",
    storedInCells: false,
  }),
  lastEditedBy: def({
    type: "lastEditedBy",
    label: "Last edited by",
    icon: IconUserEdit,
    group: "computed",
    editable: false,
    optionsKind: null,
    storedInCells: false,
  }),
  formula: def({
    type: "formula",
    label: "Formula",
    icon: IconMathFunction,
    group: "computed",
    editable: false,
    optionsKind: "formula",
  }),
};

export const PROPERTY_TYPE_LIST: PropertyTypeDefinition[] = PROPERTY_TYPE_IDS.map(
  (t) => PROPERTY_TYPES[t],
);

export const PROPERTY_TYPE_GROUPS: PropertyTypeGroup[] = [
  "text",
  "number",
  "choice",
  "other",
  "computed",
];

export function isPropertyType(type: unknown): type is PropertyType {
  return (PROPERTY_TYPE_IDS as readonly string[]).includes(type as string);
}

// Falls back to text for types this client does not know.
export function getPropertyType(type: string): PropertyTypeDefinition {
  return isPropertyType(type) ? PROPERTY_TYPES[type] : PROPERTY_TYPES.text;
}

// Cells of a property can be edited: editable type, no conversion running.
export function isPropertyEditable(property: Pick<BaseProperty, "type" | "pendingType">) {
  return getPropertyType(property.type).editable && !property.pendingType;
}

export function isPropertySortable(property: PropertyLike): boolean {
  return getPropertyType(property.type).sortable(property);
}

export function propertyFilterOperators(property: PropertyLike): FilterOp[] {
  return getPropertyType(property.type).filterOperators(property);
}

export function hasTypeOptions(type: string): boolean {
  return getPropertyType(type).optionsKind !== null;
}

// Types offered by "change type" for a property.
export function conversionTargets(property: Pick<BaseProperty, "type" | "isPrimary">) {
  return PROPERTY_TYPE_LIST.filter(
    (d) =>
      d.type !== property.type &&
      d.convertibleTarget &&
      (!property.isPrimary || d.canBePrimary),
  );
}

// ---- UI components, attached by later modules ------------------------------

export type CellRendererProps = {
  property: BaseProperty;
  row: BaseRow;
  value: unknown;
  references: RowReferenceMap;
};

export type CellEditorProps = CellRendererProps & {
  onChange: (value: unknown) => void;
  onClose: (opts?: { cancel?: boolean }) => void;
};

export type OptionsEditorProps = {
  property: Pick<BaseProperty, "id" | "type" | "typeOptions" | "name">;
  typeOptions: PropertyOptions;
  onChange: (typeOptions: PropertyOptions) => void;
};

export type PropertyTypeComponents = {
  Cell?: ComponentType<CellRendererProps>;
  Editor?: ComponentType<CellEditorProps>;
  OptionsEditor?: ComponentType<OptionsEditorProps>;
};

const components = new Map<PropertyType, PropertyTypeComponents>();

export function registerPropertyTypeComponents(
  type: PropertyType,
  parts: PropertyTypeComponents,
) {
  components.set(type, { ...components.get(type), ...parts });
}

export function getPropertyTypeComponents(type: string): PropertyTypeComponents {
  return (isPropertyType(type) && components.get(type)) || {};
}
