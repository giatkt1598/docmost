import {
  AttachmentRef,
  BlockInput,
  BlockInputError,
  blockRev,
  childHolder,
  childStart,
  CONTAINER_CHILDREN,
  DocBlockType,
  docTypeOf,
  fromBlockInput,
  IMAGE_ALIGNS,
  attachmentUrl,
  MarkdownToNodes,
  newBlockId,
  withFreshIds,
} from '../blocks/doc-blocks';
import { getEmbedUrlAndProvider } from '@docmost/editor-ext';
import {
  inlineFromSpans,
  isSafeLink,
  PmNode,
  Span,
  spansFromInline,
} from '../blocks/rich-text';
import { isDeepStrictEqual } from 'node:util';

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
  // table: change single cells (0-based row and column)
  cells?: { row: number; col: number; rich_text?: Span[]; text?: string }[];
  open?: boolean;
  width?: number | string | null;
  caption?: string | null;
  align?: string | null;
  url?: string;
  latex?: string;
  source?: string;
  title?: string;
  // draw.io: the new diagram file, made from "xml" before the edit
  attachment_id?: string;
  xml?: string;
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
    }
  // the whole content at once: restoring an earlier version (built by the
  // server from page history, never sent by a model) and its undo
  | { op: 'replace_document'; node: PmNode; rev?: string };

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

export function applyOperations(
  source: PmNode,
  operations: Operation[],
  opts: {
    markdownToNodes: MarkdownToNodes;
    // files the user may use, looked up before the edit
    attachments?: Map<string, AttachmentRef>;
    // inline nodes (mentions) checked and built before the edit
    trustedInline?: PmNode[];
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

  // the editor node that holds a container's children, and its kind
  const resolveParent = (parentId: string | null | undefined, i: number) => {
    if (!parentId) return { holder: doc, kind: 'root' };
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
    return { holder: childHolder(loc.node), kind };
  };

  // blocks inside something the tools do not model (a complex table, an
  // unknown container) can only change together with it
  const isEditableHolder = (holder: PmNode): boolean =>
    holder === doc ||
    holder.type === 'detailsContent' ||
    (CONTAINER_CHILDREN[docTypeOf(holder)] !== undefined &&
      docTypeOf(holder) !== 'unsupported');

  const insertIndex = (
    parent: PmNode,
    afterId: string | null | undefined,
    i: number,
  ) => {
    const start = childStart(parent);
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

  // New content may only use what the tools model, and safe links.
  const trusted = opts.trustedInline ?? [];
  const isTrusted = (node: PmNode) =>
    trusted.some((t) => isDeepStrictEqual(t, node));

  const checkNewContent = (node: PmNode, i: number) => {
    if (KEEP_ONLY_INLINE.has(node.type)) {
      if (!isTrusted(node)) {
        fail(
          'VALIDATION',
          i,
          undefined,
          `${node.type} can only be added through a mention span`,
        );
      }
      return;
    }
    if (!INSERTABLE.has(node.type)) {
      fail(
        'VALIDATION',
        i,
        node.attrs?.id,
        `${node.type} blocks cannot be created by the AI tools`,
      );
    }
    // a diagram must point at a file this edit checked, never a free URL
    if (
      node.type === 'drawio' &&
      !opts.attachments?.has(String(node.attrs?.attachmentId ?? ''))
    ) {
      fail('VALIDATION', i, node.attrs?.id, 'A drawio block needs its "xml"');
    }
    checkMarks(node, null, i);
    (node.content ?? []).forEach((c) => checkNewContent(c, i));
  };

  // Marks on text: links must be safe; comments and inline nodes such as
  // mentions may only be kept, never made up.
  const checkMarks = (node: PmNode, original: PmNode | null, i: number) => {
    for (const mark of node.marks ?? []) {
      if (mark.type === 'link' && !isSafeLink(String(mark.attrs?.href ?? ''))) {
        fail('VALIDATION', i, undefined, `Unsafe link: ${mark.attrs?.href}`);
      }
      if (!PASSTHROUGH_MARKS.has(mark.type)) {
        fail('VALIDATION', i, undefined, `Unknown text mark ${mark.type}`);
      }
      if (
        mark.type === 'comment' &&
        !(original && containsMark(original, mark))
      ) {
        fail(
          'VALIDATION',
          i,
          undefined,
          'Comments cannot be added by the AI tools',
        );
      }
    }
  };

  const checkPatchedInline = (next: PmNode, original: PmNode, i: number) => {
    const walk = (node: PmNode) => {
      if (node.type === 'text' || node.type === 'hardBreak') {
        checkMarks(node, original, i);
        return;
      }
      if (KEEP_ONLY_INLINE.has(node.type)) {
        if (!containsNode(original, node) && !isTrusted(node)) {
          fail(
            'VALIDATION',
            i,
            original.attrs?.id,
            `${node.type} can only be kept as it was, not added`,
          );
        }
        return;
      }
      (node.content ?? []).forEach(walk);
    };
    (next.content ?? []).forEach(walk);
  };

  const checkPlacement = (node: PmNode, kind: string, i: number) => {
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
    const start = childStart(loc.parent);
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
      case 'replace_document': {
        if (undo && blockRev(doc) !== op.rev) {
          fail(
            'CONFLICT',
            i,
            undefined,
            'The page was changed after the version was restored',
          );
        }
        const before = clone(doc);
        doc.content = clone(op.node.content ?? []);
        for (const node of doc.content) {
          if (node.attrs?.id) {
            touched.add(node.attrs.id);
            changed.add(node.attrs.id);
          }
        }
        inverse.unshift({
          op: 'replace_document',
          node: before,
          rev: blockRev(doc),
        });
        break;
      }
      case 'insert':
      case 'reinsert': {
        const { holder, kind } = resolveParent(op.parent_id, i);
        let nodes: PmNode[];
        if (op.op === 'insert') {
          try {
            nodes = op.blocks
              .flatMap((b) =>
                fromBlockInput(b, {
                  markdownToNodes: opts.markdownToNodes,
                  attachments: opts.attachments,
                }),
              )
              .map((n) => withFreshIds(n));
          } catch (err) {
            if (err instanceof BlockInputError) {
              fail('VALIDATION', i, undefined, err.message);
            }
            throw err;
          }
          if (nodes.length === 0) {
            fail('VALIDATION', i, undefined, 'Nothing to insert');
          }
          nodes.forEach((n) => checkNewContent(n, i));
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
          checkPlacement(n, kind, i);
          checkTables(n, i);
        });
        const index = insertIndex(holder, op.after_id, i);
        holder.content = holder.content ?? [];
        holder.content.splice(index, 0, ...nodes);
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
            : patchNode(loc.node, op.patch, i, fail, opts.attachments);
        checkTables(next, i);
        if (op.op === 'update') checkPatchedInline(next, loc.node, i);
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
        if (!isEditableHolder(loc.parent)) {
          fail(
            'VALIDATION',
            i,
            op.block_id,
            `This block sits inside a ${loc.parent.type} the tools cannot change; move or delete that block instead`,
          );
        }
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
        const { holder, kind } = resolveParent(op.parent_id, i);
        checkPlacement(loc.node, kind, i);
        const index = insertIndex(holder, op.after_id, i);
        holder.content = holder.content ?? [];
        holder.content.splice(index, 0, loc.node);
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
        if (!isEditableHolder(loc.parent)) {
          fail(
            'VALIDATION',
            i,
            op.block_id,
            `This block sits inside a ${loc.parent.type} the tools cannot change; delete that block instead`,
          );
        }
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
  table: ['header_row', 'rows', 'cells'],
  toggle: ['rich_text', 'text', 'open'],
  column: ['width'],
  image: ['caption', 'width', 'align'],
  embed: ['url'],
  math: ['latex'],
  mermaid: ['source'],
  drawio: ['attachment_id', 'title'],
  video: ['width', 'align'],
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
  attachments?: Map<string, AttachmentRef>,
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
    case 'toggle': {
      if (patch.open !== undefined) next.attrs.open = patch.open;
      if (spans) {
        const summary = { ...next.content[0] };
        setInline(summary, spans);
        next.content = [summary, next.content[1]];
      }
      break;
    }
    case 'column':
      next.attrs.width = patch.width ?? null;
      break;
    case 'image':
      if (patch.caption !== undefined) next.attrs.alt = patch.caption;
      if (patch.width !== undefined) next.attrs.width = patch.width;
      if (patch.align !== undefined) {
        if (!(IMAGE_ALIGNS as readonly string[]).includes(patch.align)) {
          fail('VALIDATION', i, id, 'align must be left, center or right');
        }
        next.attrs.align = patch.align;
      }
      break;
    case 'math':
      next.attrs.text = patch.latex ?? '';
      break;
    case 'mermaid':
      if (!patch.source?.trim()) {
        fail('VALIDATION', i, id, 'A mermaid block needs its "source"');
      }
      next.content = [{ type: 'text', text: patch.source }];
      break;
    case 'drawio': {
      if (patch.title !== undefined) next.attrs.title = patch.title;
      if (patch.attachment_id) {
        const ref = attachments?.get(patch.attachment_id);
        if (!ref) fail('VALIDATION', i, id, 'The new diagram file is missing');
        next.attrs.src = attachmentUrl(ref);
        next.attrs.attachmentId = ref.id;
        next.attrs.size = ref.fileSize;
      }
      break;
    }
    case 'video':
      if (patch.width !== undefined) next.attrs.width = patch.width;
      if (patch.align !== undefined) {
        if (!(IMAGE_ALIGNS as readonly string[]).includes(patch.align)) {
          fail('VALIDATION', i, id, 'align must be left, center or right');
        }
        next.attrs.align = patch.align;
      }
      break;
    case 'embed': {
      const { provider } = getEmbedUrlAndProvider(patch.url ?? '');
      if (!patch.url || provider === 'iframe') {
        fail(
          'VALIDATION',
          i,
          id,
          'Embeds must be a link from a known provider',
        );
      }
      next.attrs.src = patch.url;
      next.attrs.provider = provider;
      break;
    }
    case 'table': {
      const rows = patch.rows ?? currentRows(node);
      for (const cell of patch.cells ?? []) {
        if (!rows[cell.row] || rows[cell.row][cell.col] === undefined) {
          fail(
            'VALIDATION',
            i,
            id,
            `The table has no cell at row ${cell.row}, column ${cell.col}`,
          );
        }
        rows[cell.row][cell.col] =
          cell.rich_text ?? (cell.text ? [{ text: cell.text }] : []);
      }
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

// node types the tools create (blocks, table parts and inline content)
const INSERTABLE = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'callout',
  'codeBlock',
  'horizontalRule',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'details',
  'detailsSummary',
  'detailsContent',
  'columns',
  'column',
  'image',
  'attachment',
  'embed',
  'mathBlock',
  'video',
  'drawio',
  'text',
  'hardBreak',
  'mathInline',
  'status',
]);

const PASSTHROUGH_MARKS = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'highlight',
  'textStyle',
  'superscript',
  'subscript',
  'comment',
]);

// inline nodes that may be kept as they were but not made up
const KEEP_ONLY_INLINE = new Set([
  'mention',
  'footnoteReference',
  'integrationMention',
]);

function containsNode(root: PmNode, target: PmNode): boolean {
  if (isDeepStrictEqual(root, target)) return true;
  return (root.content ?? []).some((c) => containsNode(c, target));
}

function containsMark(
  root: PmNode,
  target: { type: string; attrs?: any },
): boolean {
  if ((root.marks ?? []).some((m) => isDeepStrictEqual(m, target))) return true;
  return (root.content ?? []).some((c) => containsMark(c, target));
}
