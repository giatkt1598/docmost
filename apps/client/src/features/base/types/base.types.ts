import { IPagination } from "@/lib/types";

// Data shapes of the bases API. Field names, string values and paths are
// fixed by the server; the type names are this module's own.

export const PROPERTY_TYPE_IDS = [
  "text",
  "longText",
  "number",
  "select",
  "status",
  "multiSelect",
  "date",
  "person",
  "file",
  "page",
  "checkbox",
  "url",
  "email",
  "createdAt",
  "lastEditedAt",
  "lastEditedBy",
  "formula",
] as const;
export type PropertyType = (typeof PROPERTY_TYPE_IDS)[number];

export const VIEW_KINDS = ["table", "kanban", "calendar"] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

// ---- property options ------------------------------------------------------

// Mantine colour names allowed for choices.
export const CHOICE_PALETTE = [
  "gray",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
] as const;
export type PaletteColor = (typeof CHOICE_PALETTE)[number];

export const STATUS_GROUPS = ["todo", "inProgress", "complete"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export type PropertyChoice = {
  id: string;
  name: string;
  // unknown colour names render as gray
  color: PaletteColor | string;
  category?: StatusGroup;
};

export type NumberStyle = "plain" | "currency" | "percent" | "progress";
export type SeparatorStyle =
  | "none"
  | "local"
  | "comma_period"
  | "period_comma"
  | "space_comma"
  | "space_period";
export type ClockStyle = "12h" | "24h";
export type FormulaOutput = "number" | "text" | "boolean" | "date";

type WithDefault<T> = { defaultValue?: T | null };

type ChoiceShape = WithDefault<string | string[]> & {
  choices: PropertyChoice[];
  choiceOrder: string[];
  disableColors?: boolean;
};

type DateShape = {
  dateFormat?: string;
  includeTime?: boolean;
  timeFormat?: ClockStyle;
};

// typeOptions of each property type, in one map.
export type OptionsByType = {
  text: WithDefault<string> & { richText?: boolean };
  longText: WithDefault<string> & { richText?: boolean };
  number: WithDefault<number> & {
    format?: NumberStyle;
    separators?: SeparatorStyle;
    precision?: number;
    currencyCode?: string;
    currencySymbol?: string;
  };
  select: ChoiceShape;
  status: ChoiceShape;
  multiSelect: ChoiceShape;
  date: DateShape & WithDefault<string>;
  person: WithDefault<string | string[]> & { allowMultiple?: boolean };
  file: Record<string, never>;
  page: Record<string, never>;
  checkbox: { defaultValue?: boolean };
  url: WithDefault<string>;
  email: WithDefault<string>;
  createdAt: DateShape;
  lastEditedAt: DateShape;
  lastEditedBy: Record<string, never>;
  formula: {
    source: string;
    resultType: FormulaOutput;
    dependencies: string[];
    ast?: unknown;
    astVersion?: number;
    formatOptions?: Record<string, unknown>;
  };
};

export type OptionsOf<T extends PropertyType> = OptionsByType[T];
export type PropertyOptions = OptionsByType[PropertyType] | Record<string, unknown>;

// Short names for the shapes used most.
export type ChoiceOptions = OptionsOf<"select">;
export type NumberOptions = OptionsOf<"number">;
export type DateOptions = OptionsOf<"date">;
export type PersonOptions = OptionsOf<"person">;
export type FormulaOptions = OptionsOf<"formula">;

// ---- records ---------------------------------------------------------------

export type BaseProperty = {
  id: string;
  pageId: string;
  workspaceId: string;
  name: string;
  type: PropertyType;
  typeOptions: PropertyOptions | null;
  position: string;
  isPrimary: boolean;
  // set while a background conversion to another type runs
  pendingType: PropertyType | null;
  pendingTypeOptions: PropertyOptions | null;
  pendingToken: string | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FormulaErrorCell = { __err: string };

export type AttachedFile = {
  id: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  url?: string;
};

// propertyId -> stored value (see validateCells on the server)
export type CellMap = Record<string, unknown>;

export type BaseRow = {
  id: string;
  pageId: string;
  workspaceId: string;
  cells: CellMap;
  position: string;
  creatorId: string | null;
  lastUpdatedById: string | null;
  docPageId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// ---- filtering and sorting ------------------------------------------------

export const FILTER_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "ncontains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
  "before",
  "after",
  "onOrBefore",
  "onOrAfter",
  "any",
  "none",
  "all",
  "isWithin",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export const RELATIVE_DAY_PRESETS = [
  "today",
  "tomorrow",
  "yesterday",
  "oneWeekAgo",
  "oneWeekFromNow",
  "oneMonthAgo",
  "oneMonthFromNow",
] as const;
export type RelativeDayPreset = (typeof RELATIVE_DAY_PRESETS)[number];

export const DAY_RANGE_PRESETS = [
  "pastWeek",
  "pastMonth",
  "pastYear",
  "thisWeek",
  "thisMonth",
  "thisYear",
  "nextWeek",
  "nextMonth",
  "nextYear",
] as const;
export type DayRangePreset = (typeof DAY_RANGE_PRESETS)[number];

export type DateFilterArg =
  | { mode: "exact"; date: string }
  | { mode: "relative"; preset: RelativeDayPreset }
  | { mode: "range"; preset: DayRangePreset };

export type FilterCondition = {
  propertyId: string;
  op: FilterOp;
  value?: unknown;
};

export type RowFilter = {
  op: "and" | "or";
  children: Array<FilterCondition | RowFilter>;
};

export type SortRule = { propertyId: string; direction: "asc" | "desc" };

// What a row list is narrowed and ordered by (also its cache identity).
export type RowQuery = {
  filter?: RowFilter;
  sorts?: SortRule[];
  search?: string;
};

// ---- views -----------------------------------------------------------------

export type BaseViewConfig = {
  sorts?: SortRule[];
  filter?: RowFilter;
  propertyOrder?: string[];
  propertyWidths?: Record<string, number>;
  hiddenPropertyIds?: string[];
  // kanban: properties shown on cards
  visiblePropertyIds?: string[];
  groupByPropertyId?: string;
  hiddenChoiceIds?: string[];
  choiceOrder?: string[];
};

// views/update merges the config; a null value removes the key
export type BaseViewConfigPatch = {
  [K in keyof BaseViewConfig]?: BaseViewConfig[K] | null;
};

export type BaseView = {
  id: string;
  pageId: string;
  workspaceId: string;
  creatorId: string | null;
  name: string;
  type: ViewKind;
  config: BaseViewConfig;
  position: string;
  createdAt: string;
  updatedAt: string;
};

// ---- base ------------------------------------------------------------------

export type BaseAccess = { canEdit: boolean; hasRestriction: boolean };

export type Base = {
  id: string;
  slugId: string;
  pageId: string;
  name: string;
  icon?: string;
  spaceId: string;
  workspaceId: string;
  creatorId: string | null;
  properties: BaseProperty[];
  views: BaseView[];
  createdAt: string;
  updatedAt: string;
  baseSchemaVersion: number;
  permissions?: BaseAccess;
};

export type RefUser = { id: string; name: string | null; avatarUrl: string | null };

export type RefPage = {
  id: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  spaceId: string;
  space: { id: string; slug: string; name: string } | null;
};

// Users and pages that cells point at, resolved by the rows endpoint.
export type RowReferenceMap = {
  users: Record<string, RefUser>;
  pages: Record<string, RefPage>;
};

export type RowsChunk = IPagination<BaseRow> & { references: RowReferenceMap };

export type CsvImportSummary = {
  imported: number;
  createdProperties: string[];
  skippedColumns: string[];
};

export type RowDocPage = {
  id: string;
  slugId: string;
  title: string | null;
  spaceSlug: string | null;
  created: boolean;
};

// ---- request bodies -------------------------------------------------------

export type SeedTemplate = "kanban";

export type NewBaseFields = {
  parentPageId?: string;
  spaceId?: string;
  name?: string;
  icon?: string;
  template?: SeedTemplate;
};

export type BaseChanges = { name?: string; icon?: string };

export type NewPropertyFields = {
  name: string;
  type: PropertyType;
  typeOptions?: PropertyOptions;
};

export type PropertyChanges = {
  name?: string;
  type?: PropertyType;
  typeOptions?: PropertyOptions;
};

export type PropertyChangeResult = {
  property: BaseProperty;
  // set when the type change runs as a background job
  jobId: string | null;
};

export type NewRowFields = {
  cells?: CellMap;
  afterRowId?: string;
  position?: string;
};

export type RowChanges = { cells?: CellMap; position?: string };

export type NewViewFields = {
  name: string;
  type?: ViewKind;
  config?: BaseViewConfig;
};

export type ViewChanges = {
  name?: string;
  type?: ViewKind;
  config?: BaseViewConfigPatch;
  position?: string;
};

// Read-only access for share viewers: shareId or spaceSlug, plus the host
// page when the base is only embedded in a shared page.
export type PublicAccess = {
  shareId?: string;
  spaceSlug?: string;
  hostPageId?: string;
};

// ---- realtime --------------------------------------------------------------

type Scoped<Op extends string, Extra> = {
  operation: Op;
  pageId: string;
  requestId?: string | null;
} & Extra;

export type BaseRealtimeEvent =
  | Scoped<"base:subscribed", { schemaVersion: number }>
  | Scoped<"base:row:created", { row: BaseRow }>
  | Scoped<"base:row:updated", { rowId: string; updatedCells: CellMap }>
  | Scoped<"base:row:deleted", { rowId: string }>
  | Scoped<"base:rows:deleted", { rowIds: string[] }>
  | Scoped<"base:row:reordered", { rowId: string; position: string }>
  | Scoped<"base:rows:updated", { rowIds: string[]; propertyIds: string[] }>
  | Scoped<"base:property:created", { property: BaseProperty }>
  | Scoped<"base:property:updated", { property: BaseProperty }>
  | Scoped<"base:property:deleted", { propertyId: string }>
  | Scoped<"base:property:reordered", { propertyId: string; position: string }>
  | Scoped<"base:view:created", { view: BaseView }>
  | Scoped<"base:view:updated", { view: BaseView }>
  | Scoped<"base:view:deleted", { viewId: string }>
  | Scoped<"base:schema:bumped", { schemaVersion: number }>
  | Scoped<
      "base:formula:recompute:started",
      { propertyIds: string[]; jobId: string }
    >
  | Scoped<
      "base:formula:recompute:completed",
      { propertyIds: string[]; jobId: string; processed: number; errored: number }
    >;
