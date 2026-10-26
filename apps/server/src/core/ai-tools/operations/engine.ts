import {
  BlockInput,
  blockRev,
  CONTAINER_CHILDREN,
  DocBlockType,
  docTypeOf,
  fromBlockInput,
  MarkdownToNodes,
  newBlockId,
} from '../blocks/doc-blocks';
import {
  inlineFromSpans,
  PmNode,
  Span,
  spansFromInline,
} from '../blocks/rich-text';

// Applies block operations to a page's ProseMirror JSON, all or nothing.
// Pure and synchronous, so the caller can run it inside one Yjs
// transaction: what is checked is exactly what gets written.

export type BlockPatch = {
  type?: 'paragraph' | 'heading';
  rich_text?: Span[];
  text?: string;
  level?: number;
  checked?: boolean;
  language?: string | null;
  variant?: string;
  icon?: string | null;
  start?: number;
  header_row?: boolean;
  rows?: Span[][][];
};

export type Operation =
  | {
      op: 'insert';
      parent_id?: string | null;
      after_id?: string | null;
      blocks: BlockInput[];
    }
  | { op: 'update'; block_id: string; rev?: string; patch: BlockPatch }
  | {
      op: 'move';
      block_id: string;
      rev?: string;
      parent_id?: string | null;
      after_id?: string | null;
    }
  | { op: 'delete'; block_id: string; rev?: string }
  // used by Undo: put back an exact earlier node
  | { op: 'restore'; block_id: string; rev: string; node: PmNode }
  | {
      op: 'reinsert';
      parent_id: string | null;
      after_id: string | null;
      node: PmNode;
    };

export type EditErrorCode = 'CONFLICT' | 'VALIDATION' | 'NOT_FOUND';

export type EditErrorDetail = {
  op_index?: number;
  block_id?: string;
  reason: string;
};

export class EditError extends Error {
  constructor(
    public readonly code: EditErrorCode,
    message: string,
    public readonly details: EditErrorDetail[] = [],
  ) {
    super(message);
  }
}

export type ApplyResult = {
  doc: PmNode;
  // operations that take the document back, newest first
  inverse: Operation[];
  // blocks created, changed or moved, and blocks removed
  changedIds: string[];
  deletedIds: string[];
};

type Location = {
  node: PmNode;
  parent: PmNode; // the node whose content holds it (the doc at top level)
  index: number;
  parentId: string | null; // DocBlock parent; null for the page itself
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function containerKind(parent: PmNode, isRoot: boolean): string {
  return isRoot ? 'root' : docTypeOf(parent);
}

// first content index of a container's DocBlock children
function childStart(parent: PmNode, isRoot: boolean): number {
  if (isRoot) return 0;
  const kind = docTypeOf(parent);
  return kind === 'list_item' || kind === 'todo_item' ? 1 : 0;
}

export function applyOperations(
  source: PmNode,
  operations: Operation[],
  opts: {
    markdownToNodes: MarkdownToNodes;
    // throws when the result breaks the editor schema
    checkSchema: (doc: PmNode) => void;
    maxBytes?: number;
    // 'undo' checks every rev against the state right before each step
    mode?: 'edit' | 'undo';
  },
): ApplyResult {
  const doc = clone(source);
  if (!doc.content) doc.content = [];

  const locate = (id: string): Location | null => {
    let found: Location | null = null;
    const walk = (node: PmNode, blockParentId: string | null) => {
      const content = node.content ?? [];
      for (let i = 0; i < content.length && !found; i++) {
        const child = content[i];
        if (child.attrs?.id === id && child.type !== 'text') {
          found = {
            node: child,
            parent: node,
            index: i,
            parentId: blockParentId,
          };
          return;
        }
        const nextParent =
          child.attrs?.id && docTypeOf(child) !== 'unsupported'
            ? child.attrs.id
            : blockParentId;
        walk(child, nextParent);
      }
    };
    walk(doc, null);
    return found;
  };

  // revs as the caller read them
  const originalRevs = new Map<string, string>();
  const indexRevs = (node: PmNode) => {
    for (const child of node.content ?? []) {
      if (child.attrs?.id && child.type !== 'text') {
        originalRevs.set(child.attrs.id, blockRev(child));
      }
      indexRevs(child);
    }
  };
  indexRevs(doc);
  const touched = new Set<string>();

  const fail = (
    code: EditErrorCode,
    opIndex: number,
    blockId: string | undefined,
    reason: string,
  ): never => {
    throw new EditError(code, reason, [
      { op_index: opIndex, ...(blockId && { block_id: blockId }), reason },
    ]);
  };

  const mustLocate = (id: string, i: number): Location => {
    const loc = locate(id);
    if (!loc) fail('NOT_FOUND', i, id, `Block ${id} does not exist (any more)`);
    return loc;
  };

  // A caller's rev refers to the page as it read it; blocks this batch
  // already changed are not checked again.
  const undo = opts.mode === 'undo';
  const checkRev = (id: string, rev: string | undefined, i: number) => {
    if (undo) {
      if (!rev) fail('VALIDATION', i, id, 'Undo steps need a rev');
      checkCurrentRev(mustLocate(id, i), rev, i);
      return;
    }
    if (!rev || touched.has(id)) return;
    const original = originalRevs.get(id);
    if (original && original !== rev) {
      fail(
        'CONFLICT',
        i,
        id,
        `Block ${id} changed since it was read; read it again`,
      );
    }
  };

  // Undo checks against the state right before each step.
  const checkCurrentRev = (loc: Location, rev: string, i: number) => {
    if (blockRev(loc.node) !== rev) {
      fail(
        'CONFLICT',
        i,
        loc.node.attrs?.id,
        `Block ${loc.node.attrs?.id} was changed after the AI edit`,
      );
    }
  };

  const resolveParent = (parentId: string | null | undefined, i: number) => {
    if (!parentId) return { parent: doc, isRoot: true };
    const loc = mustLocate(parentId, i);
    const kind = docTypeOf(loc.node);
    if (!CONTAINER_CHILDREN[kind] || kind === 'unsupported') {
      fail(
        'VALIDATION',
        i,
        parentId,
        `A ${kind} block cannot hold child blocks`,
      );
    }
    return { parent: loc.node, isRoot: false };
  };

  const insertIndex = (
    parent: PmNode,
    isRoot: boolean,
    afterId: string | null | undefined,
    i: number,
  ) => {
    const start = childStart(parent, isRoot);
    if (!afterId) return start;
    const index = (parent.content ?? []).findIndex(
      (c, idx) => idx >= start && c.attrs?.id === afterId,
    );
    if (index < 0) {
      fail(
        'VALIDATION',
        i,
        afterId,
        `Block ${afterId} is not a child of the given parent`,
      );
    }
    return index + 1;
  };

  // every row of a table needs the same number of cells
  const checkTables = (node: PmNode, i: number) => {
    if (node.type === 'table') {
      const widths = (node.content ?? []).map((r) => r.content?.length ?? 0);
      if (
        widths.length === 0 ||
        widths.some((w) => w !== widths[0] || w === 0)
      ) {
        fail(
          'VALIDATION',
          i,
          node.attrs?.id,
          'Every table row needs the same number of cells',
        );
      }
    }
    (node.content ?? []).forEach((c) => checkTables(c, i));
  };

  const checkPlacement = (
    node: PmNode,
    parent: PmNode,
    isRoot: boolean,
    i: number,
  ) => {
    const kind = containerKind(parent, isRoot);
    const type: DocBlockType = docTypeOf(node);
    if (!CONTAINER_CHILDREN[kind]?.includes(type)) {
      fail(
        'VALIDATION',
        i,
        node.attrs?.id,
        `A ${type} block cannot be placed in ${kind === 'root' ? 'the page' : `a ${kind}`}`,
      );
    }
  };

  // DocBlock sibling before a node, for putting it back later
  const previousSiblingId = (loc: Location): string | null => {
    const start = childStart(loc.parent, loc.parent === doc);
    return loc.index > start
      ? (loc.parent.content[loc.index - 1].attrs?.id ?? null)
      : null;
  };

  const isInside = (node: PmNode, id: string): boolean =>
    (node.content ?? []).some((c) => c.attrs?.id === id || isInside(c, id));

  const inverse: Operation[] = [];
  const changed = new Set<string>();
  const deleted = new Set<string>();

  operations.forEach((op, i) => {
    switch (op.op) {
      case 'insert':
      case 'reinsert': {
        const { parent, isRoot } = resolveParent(op.parent_id, i);
        let nodes: PmNode[];
        if (op.op === 'insert') {
          nodes = op.blocks.flatMap((b) =>
            fromBlockInput(b, opts.markdownToNodes),
          );
          if (nodes.length === 0) {
            fail('VALIDATION', i, undefined, 'Nothing to insert');
          }
        } else {
          if (!undo) {
            fail('VALIDATION', i, undefined, 'reinsert is only used by Undo');
          }
          if (locate(op.node.attrs?.id)) {
            fail(
              'CONFLICT',
              i,
              op.node.attrs?.id,
              `Block ${op.node.attrs?.id} already exists again`,
            );
          }
          nodes = [op.node];
        }
        nodes.forEach((n) => {
          checkPlacement(n, parent, isRoot, i);
          checkTables(n, i);
        });
        const index = insertIndex(parent, isRoot, op.after_id, i);
        parent.content = parent.content ?? [];
        parent.content.splice(index, 0, ...nodes);
        for (const n of nodes) {
          const id = n.attrs?.id;
          if (!id) continue;
          touched.add(id);
          changed.add(id);
          deleted.delete(id);
          inverse.unshift({ op: 'delete', block_id: id, rev: blockRev(n) });
        }
        break;
      }

      case 'update':
      case 'restore': {
        const loc = mustLocate(op.block_id, i);
        if (op.op === 'restore' && !undo) {
          fail('VALIDATION', i, op.block_id, 'restore is only used by Undo');
        }
        checkRev(op.block_id, op.rev, i);
        const before = clone(loc.node);
        const next =
          op.op === 'restore'
            ? clone(op.node)
            : patchNode(loc.node, op.patch, i, fail);
        checkTables(next, i);
        loc.parent.content[loc.index] = next;
        touched.add(op.block_id);
        changed.add(op.block_id);
        inverse.unshift({
          op: 'restore',
          block_id: op.block_id,
          rev: blockRev(next),
          node: before,
        });
        break;
      }

      case 'move': {
        const loc = mustLocate(op.block_id, i);
        checkRev(op.block_id, op.rev, i);
        if (
          op.parent_id === op.block_id ||
          (op.parent_id && isInside(loc.node, op.parent_id))
        ) {
          fail('VALIDATION', i, op.block_id, 'A block cannot move into itself');
        }
        const back = {
          parent_id: loc.parentId,
          after_id: previousSiblingId(loc),
        };
        loc.parent.content.splice(loc.index, 1);
        const { parent, isRoot } = resolveParent(op.parent_id, i);
        checkPlacement(loc.node, parent, isRoot, i);
        const index = insertIndex(parent, isRoot, op.after_id, i);
        parent.content = parent.content ?? [];
        parent.content.splice(index, 0, loc.node);
        touched.add(op.block_id);
        changed.add(op.block_id);
        inverse.unshift({
          op: 'move',
          block_id: op.block_id,
          rev: blockRev(loc.node),
          ...back,
        });
        break;
      }

      case 'delete': {
        const loc = mustLocate(op.block_id, i);
        checkRev(op.block_id, op.rev, i);
        const back: Operation = {
          op: 'reinsert',
          parent_id: loc.parentId,
          after_id: previousSiblingId(loc),
          node: clone(loc.node),
        };
        loc.parent.content.splice(loc.index, 1);
        touched.add(op.block_id);
        changed.delete(op.block_id);
        deleted.add(op.block_id);
        inverse.unshift(back);
        break;
      }
    }
  });

  try {
    opts.checkSchema(doc);
  } catch (err) {
    throw new EditError(
      'VALIDATION',
      `The result is not a valid page: ${(err as Error).message}`,
    );
  }
  const max = opts.maxBytes ?? 5 * 1024 * 1024;
  if (JSON.stringify(doc).length > max) {
    throw new EditError('VALIDATION', 'The page would become too large');
  }

  return {
    doc,
    inverse,
    changedIds: [...changed],
    deletedIds: [...deleted],
  };
}

const PATCH_KEYS: Record<string, (keyof BlockPatch)[]> = {
  paragraph: ['type', 'rich_text', 'text', 'level'],
  heading: ['type', 'rich_text', 'text', 'level'],
  list_item: ['rich_text', 'text'],
  todo_item: ['rich_text', 'text', 'checked'],
  code: ['text', 'language'],
  callout: ['variant', 'icon'],
  numbered_list: ['start'],
  table: ['header_row', 'rows'],
};

function patchNode(
  node: PmNode,
  patch: BlockPatch,
  i: number,
  fail: (
    code: EditErrorCode,
    i: number,
    id: string | undefined,
    reason: string,
  ) => never,
): PmNode {
  const type = docTypeOf(node);
  const id = node.attrs?.id;
  const allowed = PATCH_KEYS[type];
  if (!allowed) {
    fail('VALIDATION', i, id, `A ${type} block cannot be updated; replace it`);
  }
  const keys = Object.keys(patch).filter(
    (k) => (patch as any)[k] !== undefined,
  ) as (keyof BlockPatch)[];
  if (keys.length === 0) fail('VALIDATION', i, id, 'The patch is empty');
  const wrong = keys.filter((k) => !allowed.includes(k));
  if (wrong.length) {
    fail(
      'VALIDATION',
      i,
      id,
      `A ${type} block has no ${wrong.join(', ')}; allowed: ${allowed.join(', ')}`,
    );
  }

  const next: PmNode = clone(node);
  next.attrs = { ...(next.attrs ?? {}) };
  const spans =
    patch.rich_text ??
    (patch.text !== undefined && type !== 'code'
      ? [{ text: patch.text }]
      : undefined);

  switch (type) {
    case 'paragraph':
    case 'heading': {
      const target =
        patch.type ?? (type === 'heading' ? 'heading' : 'paragraph');
      next.type = target;
      if (target === 'heading') {
        next.attrs.level = patch.level ?? node.attrs?.level ?? 2;
      } else {
        delete next.attrs.level;
      }
      if (spans) setInline(next, spans);
      break;
    }
    case 'list_item':
    case 'todo_item': {
      if (patch.checked !== undefined) next.attrs.checked = patch.checked;
      if (spans) {
        const first = next.content?.[0] ?? {
          type: 'paragraph',
          attrs: { id: newBlockId() },
        };
        setInline(first, spans);
        next.content = [first, ...(next.content ?? []).slice(1)];
      }
      break;
    }
    case 'code':
      if (patch.language !== undefined) next.attrs.language = patch.language;
      if (patch.text !== undefined) {
        next.content = patch.text ? [{ type: 'text', text: patch.text }] : [];
        if (!patch.text) delete next.content;
      }
      break;
    case 'callout':
      if (patch.variant !== undefined) next.attrs.type = patch.variant;
      if (patch.icon !== undefined) next.attrs.icon = patch.icon;
      break;
    case 'numbered_list':
      if (patch.start !== undefined) next.attrs.start = patch.start;
      break;
    case 'table': {
      const rows = patch.rows ?? currentRows(node);
      const header =
        patch.header_row ??
        node.content?.[0]?.content?.every((c) => c.type === 'tableHeader') ??
        false;
      next.content = rows.map((row, r) => ({
        type: 'tableRow',
        ...(node.content?.[r]?.attrs && { attrs: node.content[r].attrs }),
        content: row.map((cellSpans, c) => {
          const old = node.content?.[r]?.content?.[c];
          const paragraph: PmNode = {
            type: 'paragraph',
            attrs: { id: old?.content?.[0]?.attrs?.id ?? newBlockId() },
          };
          setInline(paragraph, cellSpans);
          return {
            type: r === 0 && header ? 'tableHeader' : 'tableCell',
            attrs: old?.attrs ?? { colspan: 1, rowspan: 1 },
            content: [paragraph],
          };
        }),
      }));
      break;
    }
  }
  return next;
}

function setInline(node: PmNode, spans: Span[]) {
  const content = inlineFromSpans(spans);
  if (content.length) node.content = content;
  else delete node.content;
}

function currentRows(table: PmNode): Span[][][] {
  // keep the existing cells when only the header flag changes
  return (table.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      spansFromInline(cell.content?.[0]?.content),
    ),
  );
}
