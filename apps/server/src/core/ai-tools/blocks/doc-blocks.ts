import { createHash, randomBytes } from 'node:crypto';
import { BLOCK_ID_TYPES } from '@docmost/editor-ext';
import {
  inlineFromSpans,
  PmNode,
  plainText,
  Span,
  spansFromInline,
} from './rich-text';

// The page as the AI tools see it: a tree of typed blocks with stable ids.
// Mapped to and from the editor's ProseMirror JSON. Pure functions.

export type DocBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'bulleted_list'
  | 'numbered_list'
  | 'list_item'
  | 'todo_list'
  | 'todo_item'
  | 'table'
  | 'unsupported';

export type DocBlock = {
  id: string;
  rev: string;
  type: DocBlockType;
  rich_text?: Span[];
  level?: number;
  checked?: boolean;
  language?: string | null;
  text?: string;
  variant?: string;
  icon?: string | null;
  start?: number;
  header_row?: boolean;
  rows?: Span[][][];
  children?: DocBlock[];
  has_children?: boolean;
  child_count?: number;
  // unsupported blocks: what the editor calls them, and their text
  docmost_type?: string;
  preview?: string;
};

export const CALLOUT_VARIANTS = [
  'default',
  'info',
  'note',
  'success',
  'warning',
  'danger',
] as const;

const ID_TYPES = new Set<string>(BLOCK_ID_TYPES);

// Containers and the block types they accept. `root` is the page itself.
export const CONTAINER_CHILDREN: Record<string, readonly DocBlockType[]> = {
  root: [
    'paragraph',
    'heading',
    'quote',
    'callout',
    'code',
    'divider',
    'bulleted_list',
    'numbered_list',
    'todo_list',
    'table',
    'unsupported',
  ],
  quote: [
    'paragraph',
    'heading',
    'quote',
    'callout',
    'code',
    'divider',
    'bulleted_list',
    'numbered_list',
    'todo_list',
    'table',
    'unsupported',
  ],
  callout: [
    'paragraph',
    'heading',
    'quote',
    'code',
    'divider',
    'bulleted_list',
    'numbered_list',
    'todo_list',
    'table',
    'unsupported',
  ],
  list_item: [
    'paragraph',
    'heading',
    'quote',
    'callout',
    'code',
    'bulleted_list',
    'numbered_list',
    'todo_list',
  ],
  todo_item: [
    'paragraph',
    'heading',
    'quote',
    'callout',
    'code',
    'bulleted_list',
    'numbered_list',
    'todo_list',
  ],
  bulleted_list: ['list_item'],
  numbered_list: ['list_item'],
  todo_list: ['todo_item'],
};

export function newBlockId(): string {
  // same alphabet and length as the editor's ids
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(12);
  let id = '';
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return id;
}

function stableStringify(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// Changes whenever the block or anything inside it changes.
export function blockRev(node: PmNode): string {
  return createHash('sha1')
    .update(stableStringify(node))
    .digest('hex')
    .slice(0, 8);
}

// Gives every block node an id when it has none or repeats an earlier one.
// Idempotent: a document whose ids are fine comes back unchanged.
export function assignBlockIds(doc: PmNode): { doc: PmNode; changed: boolean } {
  const seen = new Set<string>();
  let changed = false;
  const walk = (node: PmNode): PmNode => {
    let next = node;
    if (ID_TYPES.has(node.type)) {
      const id = node.attrs?.id;
      if (!id || seen.has(id)) {
        next = { ...node, attrs: { ...(node.attrs ?? {}), id: newBlockId() } };
        changed = true;
      }
      seen.add(next.attrs.id);
    }
    if (next.content) {
      const content = next.content.map(walk);
      if (content.some((c, i) => c !== next.content[i])) {
        next = { ...next, content };
      }
    }
    return next;
  };
  const result = walk(doc);
  return { doc: result, changed };
}

export function nodeText(node: PmNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content ?? []).map(nodeText);
  return node.content?.some((c) => c.type !== 'text' && c.type !== 'hardBreak')
    ? inner.join('\n')
    : inner.join('');
}

function cellIsSimple(cell: PmNode): boolean {
  const a = cell.attrs ?? {};
  return (
    (a.colspan ?? 1) === 1 &&
    (a.rowspan ?? 1) === 1 &&
    cell.content?.length === 1 &&
    cell.content[0].type === 'paragraph'
  );
}

export function isSimpleTable(node: PmNode): boolean {
  const rows = node.content ?? [];
  if (rows.length === 0) return false;
  const width = rows[0].content?.length ?? 0;
  return (
    width > 0 &&
    rows.every(
      (row) => row.content?.length === width && row.content.every(cellIsSimple),
    )
  );
}

// The DocBlock type of an editor node.
export function docTypeOf(node: PmNode): DocBlockType {
  switch (node.type) {
    case 'paragraph':
      return 'paragraph';
    case 'heading':
      return 'heading';
    case 'blockquote':
      return 'quote';
    case 'callout':
      return 'callout';
    case 'codeBlock':
      return 'code';
    case 'horizontalRule':
      return 'divider';
    case 'bulletList':
      return 'bulleted_list';
    case 'orderedList':
      return 'numbered_list';
    case 'listItem':
      return 'list_item';
    case 'taskList':
      return 'todo_list';
    case 'taskItem':
      return 'todo_item';
    case 'table':
      return isSimpleTable(node) ? 'table' : 'unsupported';
    default:
      return 'unsupported';
  }
}

// The nodes that count as DocBlock children of a node: for list items the
// first paragraph is the item's own text, not a child.
export function blockChildren(node: PmNode): PmNode[] {
  const type = docTypeOf(node);
  const content = node.content ?? [];
  if (type === 'list_item' || type === 'todo_item') return content.slice(1);
  if (
    type === 'quote' ||
    type === 'callout' ||
    type === 'bulleted_list' ||
    type === 'numbered_list' ||
    type === 'todo_list'
  ) {
    return content;
  }
  return [];
}

export function isContainer(type: DocBlockType): boolean {
  return type in CONTAINER_CHILDREN && type !== 'unsupported';
}

export function toDocBlock(node: PmNode, depth = 1): DocBlock {
  const type = docTypeOf(node);
  const a = node.attrs ?? {};
  const block: DocBlock = { id: a.id, rev: blockRev(node), type };

  switch (type) {
    case 'paragraph':
      block.rich_text = spansFromInline(node.content);
      break;
    case 'heading':
      block.level = a.level ?? 1;
      block.rich_text = spansFromInline(node.content);
      break;
    case 'callout':
      block.variant = a.type ?? 'info';
      if (a.icon) block.icon = a.icon;
      break;
    case 'code':
      block.language = a.language ?? null;
      block.text = nodeText(node);
      break;
    case 'numbered_list':
      if (a.start && a.start !== 1) block.start = a.start;
      break;
    case 'list_item':
    case 'todo_item':
      if (type === 'todo_item') block.checked = !!a.checked;
      block.rich_text = spansFromInline(node.content?.[0]?.content);
      break;
    case 'table': {
      const rows = node.content ?? [];
      block.header_row =
        rows[0]?.content?.every((c) => c.type === 'tableHeader') ?? false;
      block.rows = rows.map((row) =>
        (row.content ?? []).map((cell) =>
          spansFromInline(cell.content?.[0]?.content),
        ),
      );
      break;
    }
    case 'unsupported':
      block.docmost_type = node.type;
      block.preview = nodeText(node).slice(0, 300);
      if (node.content?.length) block.has_children = true;
      break;
  }

  const children = blockChildren(node);
  if (children.length) {
    if (depth > 0) {
      block.children = children.map((c) => toDocBlock(c, depth - 1));
    } else {
      block.has_children = true;
      block.child_count = children.length;
    }
  }
  return block;
}

// What a tool may send to create a block. `text` is shorthand for a single
// plain span; `items` is shorthand for list items.
export type BlockInput = {
  type: Exclude<DocBlockType, 'unsupported'> | 'markdown';
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
  items?: (string | Span[] | BlockInput)[];
  children?: BlockInput[];
  markdown?: string;
};

function spansOf(input: { rich_text?: Span[]; text?: string }): Span[] {
  if (input.rich_text) return input.rich_text;
  return input.text ? [{ text: input.text }] : [];
}

function paragraph(spans: Span[]): PmNode {
  const content = inlineFromSpans(spans);
  return {
    type: 'paragraph',
    attrs: { id: newBlockId() },
    ...(content.length && { content }),
  };
}

function itemInputs(
  input: BlockInput,
  itemType: 'list_item' | 'todo_item',
): BlockInput[] {
  const items = input.items ?? [];
  return [
    ...items.map((item): BlockInput => {
      if (typeof item === 'string') return { type: itemType, text: item };
      if (Array.isArray(item)) return { type: itemType, rich_text: item };
      return item;
    }),
    ...(input.children ?? []),
  ];
}

// Expands markdown into editor nodes; injected so this module stays pure.
export type MarkdownToNodes = (markdown: string) => PmNode[];

// Editor nodes for a new block, with fresh ids.
export function fromBlockInput(
  input: BlockInput,
  markdownToNodes: MarkdownToNodes,
): PmNode[] {
  const children = (list: BlockInput[] = []) =>
    list.flatMap((c) => fromBlockInput(c, markdownToNodes));
  const id = newBlockId();

  switch (input.type) {
    case 'markdown':
      return markdownToNodes(input.markdown ?? '');
    case 'paragraph':
      return [paragraph(spansOf(input))];
    case 'heading': {
      const content = inlineFromSpans(spansOf(input));
      return [
        {
          type: 'heading',
          attrs: { id, level: input.level ?? 2 },
          ...(content.length && { content }),
        },
      ];
    }
    case 'quote':
    case 'callout': {
      const inner = children(input.children);
      if (inner.length === 0) inner.push(paragraph(spansOf(input)));
      return [
        input.type === 'quote'
          ? { type: 'blockquote', attrs: { id }, content: inner }
          : {
              type: 'callout',
              attrs: {
                id,
                type: input.variant ?? 'info',
                ...(input.icon && { icon: input.icon }),
              },
              content: inner,
            },
      ];
    }
    case 'code': {
      const text = input.text ?? '';
      return [
        {
          type: 'codeBlock',
          attrs: { id, language: input.language ?? null },
          ...(text && { content: [{ type: 'text', text }] }),
        },
      ];
    }
    case 'divider':
      return [{ type: 'horizontalRule', attrs: { id } }];
    case 'bulleted_list':
    case 'numbered_list':
      return [
        {
          type: input.type === 'bulleted_list' ? 'bulletList' : 'orderedList',
          attrs: {
            id,
            ...(input.type === 'numbered_list' && { start: input.start ?? 1 }),
          },
          content: children(itemInputs(input, 'list_item')),
        },
      ];
    case 'todo_list':
      return [
        {
          type: 'taskList',
          attrs: { id },
          content: children(itemInputs(input, 'todo_item')),
        },
      ];
    case 'list_item':
    case 'todo_item':
      return [
        {
          type: input.type === 'list_item' ? 'listItem' : 'taskItem',
          attrs: {
            id,
            ...(input.type === 'todo_item' && { checked: !!input.checked }),
          },
          content: [paragraph(spansOf(input)), ...children(input.children)],
        },
      ];
    case 'table': {
      const rows = input.rows ?? [];
      return [
        {
          type: 'table',
          attrs: { id },
          content: rows.map((row, r) => ({
            type: 'tableRow',
            content: row.map((cell) => ({
              type: r === 0 && input.header_row ? 'tableHeader' : 'tableCell',
              attrs: { colspan: 1, rowspan: 1 },
              content: [paragraph(cell)],
            })),
          })),
        },
      ];
    }
  }
  return [];
}

export function previewOf(block: DocBlock): string {
  if (block.rich_text) return plainText(block.rich_text);
  if (block.text) return block.text;
  return block.preview ?? '';
}
