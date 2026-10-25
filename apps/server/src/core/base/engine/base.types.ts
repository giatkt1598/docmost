export const BASE_PROPERTY_TYPES = [
  'text',
  'longText',
  'number',
  'select',
  'status',
  'multiSelect',
  'date',
  'person',
  'file',
  'page',
  'checkbox',
  'url',
  'email',
  'createdAt',
  'lastEditedAt',
  'lastEditedBy',
  'formula',
] as const;
export type BasePropertyType = (typeof BASE_PROPERTY_TYPES)[number];

export const BASE_VIEW_TYPES = ['table', 'kanban', 'calendar'] as const;
export type BaseViewType = (typeof BASE_VIEW_TYPES)[number];

// Types whose value is derived from the row itself, never stored in cells.
export const SYSTEM_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  'createdAt',
  'lastEditedAt',
  'lastEditedBy',
]);

// Types a user cannot write cells for.
export const READONLY_CELL_TYPES: ReadonlySet<string> = new Set([
  'createdAt',
  'lastEditedAt',
  'lastEditedBy',
  'formula',
]);

export const CHOICE_TYPES: ReadonlySet<string> = new Set([
  'select',
  'status',
  'multiSelect',
]);

export const NO_VALUE_CHOICE_ID = '__no_value';

export const MAX_TEXT_LENGTH = 1000;
export const MAX_LONG_TEXT_LENGTH = 25000;

export type Choice = {
  id: string;
  name: string;
  color: string;
  category?: 'todo' | 'inProgress' | 'complete';
};

export type ChoiceTypeOptions = {
  choices: Choice[];
  choiceOrder: string[];
  disableColors?: boolean;
  defaultValue?: string | string[] | null;
};

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'ncontains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'before'
  | 'after'
  | 'onOrBefore'
  | 'onOrAfter'
  | 'any'
  | 'none'
  | 'all'
  | 'isWithin';

export type FilterCondition = {
  propertyId: string;
  op: FilterOperator;
  value?: unknown;
};

export type FilterGroup = {
  op: 'and' | 'or';
  children: Array<FilterCondition | FilterGroup>;
};

export type FilterNode = FilterCondition | FilterGroup;

export type SortSpec = { propertyId: string; direction: 'asc' | 'desc' };

// Minimal view of a property that the engine needs.
export type EngineProperty = {
  id: string;
  type: string;
  typeOptions: any;
};
