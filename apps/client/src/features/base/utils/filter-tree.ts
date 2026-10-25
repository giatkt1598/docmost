import {
  BaseProperty,
  DateFilterArg,
  FilterCondition,
  FilterOp,
  RowFilter,
} from "@/features/base/types/base.types";
import {
  filterOperatorsFor,
  filterValueKind,
} from "@/features/base/registry/filter-operators";

// Editing helpers for the filter tree. Nodes are addressed by a path of
// child indexes from the root group ([] is the root, [1, 0] the first child
// of the second child). Every helper returns a new tree.

export type FilterPath = number[];
export type FilterItem = FilterCondition | RowFilter;

// The server accepts 6 levels; the builder offers groups two levels deep.
export const MAX_GROUP_DEPTH = 2;

export const isGroup = (node: FilterItem): node is RowFilter =>
  Array.isArray((node as RowFilter).children);

export const emptyFilter = (): RowFilter => ({ op: "and", children: [] });

export function nodeAt(root: RowFilter, path: FilterPath): FilterItem | undefined {
  let node: FilterItem = root;
  for (const i of path) {
    if (!isGroup(node)) return undefined;
    node = node.children[i];
    if (!node) return undefined;
  }
  return node;
}

function replaceAt(
  root: RowFilter,
  path: FilterPath,
  fn: (node: FilterItem) => FilterItem | null,
): RowFilter {
  if (path.length === 0) {
    const next = fn(root);
    return next && isGroup(next) ? next : emptyFilter();
  }
  const [head, ...rest] = path;
  const child = root.children[head];
  if (!child) return root;
  let nextChild: FilterItem | null;
  if (rest.length === 0) nextChild = fn(child);
  else if (isGroup(child)) nextChild = replaceAt(child, rest, fn);
  else return root;
  const children = [...root.children];
  if (nextChild === null) children.splice(head, 1);
  else children[head] = nextChild;
  return { ...root, children };
}

// A value that makes sense for an operator on a property.
export function defaultFilterValue(
  property: Pick<BaseProperty, "type" | "typeOptions">,
  op: FilterOp,
): unknown {
  switch (filterValueKind(property, op)) {
    case "none":
      return undefined;
    case "boolean":
      return true;
    case "date":
      return { mode: "relative", preset: "today" } satisfies DateFilterArg;
    case "dateRange":
      return { mode: "range", preset: "thisWeek" } satisfies DateFilterArg;
    case "choices":
    case "users":
      return [];
    default:
      return "";
  }
}

export function newCondition(
  property: Pick<BaseProperty, "id" | "type" | "typeOptions">,
): FilterCondition {
  const op = filterOperatorsFor(property)[0] ?? "isNotEmpty";
  return { propertyId: property.id, op, value: defaultFilterValue(property, op) };
}

export function addCondition(
  root: RowFilter,
  groupPath: FilterPath,
  condition: FilterCondition,
): RowFilter {
  return replaceAt(root, groupPath, (g) =>
    isGroup(g) ? { ...g, children: [...g.children, condition] } : g,
  );
}

export function addGroup(
  root: RowFilter,
  groupPath: FilterPath,
  first: FilterCondition,
): RowFilter {
  if (groupPath.length >= MAX_GROUP_DEPTH) return root;
  const group: RowFilter = { op: "and", children: [first] };
  return replaceAt(root, groupPath, (g) =>
    isGroup(g) ? { ...g, children: [...g.children, group] } : g,
  );
}

export function removeNode(root: RowFilter, path: FilterPath): RowFilter {
  if (path.length === 0) return emptyFilter();
  let out = replaceAt(root, path, () => null);
  // drop groups left empty by the removal
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(out, parentPath);
  if (parentPath.length > 0 && parent && isGroup(parent) && !parent.children.length) {
    out = removeNode(out, parentPath);
  }
  return out;
}

export function setGroupOp(
  root: RowFilter,
  groupPath: FilterPath,
  op: "and" | "or",
): RowFilter {
  return replaceAt(root, groupPath, (g) => (isGroup(g) ? { ...g, op } : g));
}

export function updateCondition(
  root: RowFilter,
  path: FilterPath,
  patch: Partial<FilterCondition>,
  properties: Pick<BaseProperty, "id" | "type" | "typeOptions">[],
): RowFilter {
  return replaceAt(root, path, (node) => {
    if (isGroup(node)) return node;
    const next = { ...node, ...patch };
    const prop = properties.find((p) => p.id === next.propertyId);
    if (!prop) return next;
    if (patch.propertyId && patch.propertyId !== node.propertyId) {
      // another property: start over with its first operator
      return newCondition(prop);
    }
    if (patch.op && patch.op !== node.op && !("value" in patch)) {
      const kindBefore = filterValueKind(prop, node.op);
      const kindAfter = filterValueKind(prop, patch.op);
      if (kindBefore !== kindAfter) next.value = defaultFilterValue(prop, patch.op);
    }
    return next;
  });
}

export function countConditions(root: RowFilter | null | undefined): number {
  if (!root) return 0;
  return root.children.reduce(
    (n, c) => n + (isGroup(c) ? countConditions(c) : 1),
    0,
  );
}

function hasValue(property: Pick<BaseProperty, "type" | "typeOptions">, c: FilterCondition) {
  const kind = filterValueKind(property, c.op);
  const v = c.value;
  switch (kind) {
    case "none":
      return true;
    case "boolean":
      return typeof v === "boolean";
    case "number":
      return v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
    case "date":
    case "dateRange": {
      const d = v as DateFilterArg | undefined;
      if (!d || typeof d !== "object") return false;
      if (kind === "dateRange") return d.mode === "range" && !!d.preset;
      if (d.mode === "exact") return !!d.date && !Number.isNaN(Date.parse(d.date));
      return !!(d as { preset?: string }).preset;
    }
    case "choices":
    case "users":
      return Array.isArray(v) && v.length > 0;
    default:
      return typeof v === "string" ? v.trim() !== "" : v != null;
  }
}

// The filter as sent to the server: conditions on unknown properties, with
// operators that no longer apply, or without a value are left out, and
// empty groups disappear. Returns undefined when nothing is left.
export function pruneFilter(
  root: RowFilter | null | undefined,
  properties: Pick<BaseProperty, "id" | "type" | "typeOptions">[],
): RowFilter | undefined {
  if (!root) return undefined;
  const byId = new Map(properties.map((p) => [p.id, p]));
  const walk = (group: RowFilter): RowFilter | null => {
    const children: FilterItem[] = [];
    for (const c of group.children) {
      if (isGroup(c)) {
        const g = walk(c);
        if (g) children.push(g);
        continue;
      }
      const prop = byId.get(c.propertyId);
      if (!prop || !filterOperatorsFor(prop).includes(c.op)) continue;
      if (!hasValue(prop, c)) continue;
      const kind = filterValueKind(prop, c.op);
      children.push(
        kind === "number" ? { ...c, value: Number(c.value) } : c,
      );
    }
    return children.length ? { op: group.op, children } : null;
  };
  return walk(root) ?? undefined;
}
