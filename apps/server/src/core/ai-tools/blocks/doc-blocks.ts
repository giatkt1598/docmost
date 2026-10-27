import { createHash, randomBytes } from 'node:crypto';
import { BLOCK_ID_TYPES, getEmbedUrlAndProvider } from '@docmost/editor-ext';
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
  | 'toggle'
  | 'columns'
  | 'column'
  | 'image'
  | 'file'
  | 'embed'
  | 'math'
  | 'video'
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
  // toggle
  open?: boolean;
  // columns / column
  layout?: string;
  width?: number | string | null;
  // image, file, embed
  url?: string;
  attachment_id?: string | null;
  caption?: string | null;
  align?: string | null;
  name?: string;
  provider?: string;
  // math block
  latex?: string;
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

export const COLUMN_LAYOUTS: Record<number, string> = {
  2: 'two_equal',
  3: 'three_equal',
  4: 'four_equal',
  5: 'five_equal',
};

export const IMAGE_ALIGNS = ['left', 'center', 'right'] as const;

const ID_TYPES = new Set<string>(BLOCK_ID_TYPES);

const TEXT_BLOCKS: DocBlockType[] = [
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
  'toggle',
  'image',
  'file',
  'embed',
  'math',
  'video',
  'unsupported',
];

// Containers and the block types they accept. `root` is the page itself.
export const CONTAINER_CHILDREN: Record<string, readonly DocBlockType[]> = {
  root: [...TEXT_BLOCKS, 'columns'],
  quote: TEXT_BLOCKS,
  callout: TEXT_BLOCKS.filter((t) => t !== 'callout'),
  toggle: [...TEXT_BLOCKS, 'columns'],
  column: TEXT_BLOCKS,
  list_item: [
    'paragraph',
    'heading',
    'quote',
    'callout',
    'code',
    'bulleted_list',
    'numbered_list',
    'todo_list',
    'image',
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
    'image',
  ],
  bulleted_list: ['list_item'],
  numbered_list: ['list_item'],
  todo_list: ['todo_item'],
  columns: ['column'],
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

// A copy with a new id on every block node, e.g. for content inserted twice.
export function withFreshIds(node: PmNode): PmNode {
  const copy: PmNode = { ...node };
  if (ID_TYPES.has(node.type)) {
    copy.attrs = { ...(node.attrs ?? {}), id: newBlockId() };
  }
  if (node.content) copy.content = node.content.map(withFreshIds);
  return copy;
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

function isSimpleToggle(node: PmNode): boolean {
  return (
    node.content?.length === 2 &&
    node.content[0].type === 'detailsSummary' &&
    node.content[1].type === 'detailsContent'
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
    case 'details':
      return isSimpleToggle(node) ? 'toggle' : 'unsupported';
    case 'columns':
      return 'columns';
    case 'column':
      return 'column';
    case 'image':
      return 'image';
    case 'attachment':
      return 'file';
    case 'embed':
      return 'embed';
    case 'mathBlock':
      return 'math';
    case 'video':
      return 'video';
    default:
      return 'unsupported';
  }
}

// The editor node whose content holds a block's DocBlock children: a toggle
// keeps them in its content part, everything else in itself.
export function childHolder(node: PmNode): PmNode {
  if (docTypeOf(node) === 'toggle') return node.content[1];
  return node;
}

// first index of DocBlock children in the holder (list items start with
// their own text paragraph)
export function childStart(holder: PmNode): number {
  return holder.type === 'listItem' || holder.type === 'taskItem' ? 1 : 0;
}

// The nodes that count as DocBlock children of a node.
export function blockChildren(node: PmNode): PmNode[] {
  const type = docTypeOf(node);
  if (!(type in CONTAINER_CHILDREN)) return [];
  const holder = childHolder(node);
  return (holder.content ?? []).slice(childStart(holder));
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
    case 'toggle':
      block.rich_text = spansFromInline(node.content[0].content);
      // HTML import sets open to "" for <details open>
      block.open = a.open === true || a.open === '';
      break;
    case 'columns':
      if (a.layout) block.layout = a.layout;
      break;
    case 'column':
      if (a.width) block.width = a.width;
      break;
    case 'image':
      block.url = a.src;
      if (a.attachmentId) block.attachment_id = a.attachmentId;
      if (a.alt) block.caption = a.alt;
      if (a.width) block.width = a.width;
      if (a.align) block.align = a.align;
      break;
    case 'file':
      block.url = a.url;
      block.name = a.name;
      if (a.attachmentId) block.attachment_id = a.attachmentId;
      break;
    case 'embed':
      block.url = a.src;
      block.provider = a.provider;
      break;
    case 'math':
      block.latex = a.text ?? '';
      break;
    case 'video':
      block.url = a.src;
      if (a.attachmentId) block.attachment_id = a.attachmentId;
      if (a.width) block.width = a.width;
      if (a.align) block.align = a.align;
      break;
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
  open?: boolean;
  layout?: string;
  width?: number | string | null;
  url?: string;
  attachment_id?: string;
  caption?: string | null;
  align?: string | null;
  latex?: string;
  items?: (string | Span[] | BlockInput)[];
  children?: BlockInput[];
  markdown?: string;
};

// A file of the workspace the user may read, looked up before the edit.
export type AttachmentRef = {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
};

export type BuildContext = {
  // expands markdown into editor nodes; injected so this module stays pure
  markdownToNodes: MarkdownToNodes;
  attachments?: Map<string, AttachmentRef>;
};

export type MarkdownToNodes = (markdown: string) => PmNode[];

export class BlockInputError extends Error {}

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

export function attachmentUrl(ref: AttachmentRef): string {
  return `/api/files/${ref.id}/${ref.fileName}`;
}

function attachmentOf(input: BlockInput, ctx: BuildContext): AttachmentRef {
  const ref = input.attachment_id
    ? ctx.attachments?.get(input.attachment_id)
    : undefined;
  if (!ref) {
    throw new BlockInputError(
      `File ${input.attachment_id} is not available to you in this workspace`,
    );
  }
  return ref;
}

// Editor nodes for a new block, with fresh ids.
export function fromBlockInput(
  input: BlockInput,
  context: BuildContext | MarkdownToNodes,
): PmNode[] {
  const ctx: BuildContext =
    typeof context === 'function' ? { markdownToNodes: context } : context;
  const children = (list: BlockInput[] = []) =>
    list.flatMap((c) => fromBlockInput(c, ctx));
  const id = newBlockId();

  switch (input.type) {
    case 'markdown': {
      const nodes = ctx.markdownToNodes(input.markdown ?? '');
      if (nodes.length === 0) {
        throw new BlockInputError(
          'The "markdown" block produced no content; put the Markdown in its "markdown" field',
        );
      }
      return nodes;
    }
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
    case 'toggle': {
      const summary = inlineFromSpans(spansOf(input));
      const inner = children(input.children);
      if (inner.length === 0) inner.push(paragraph([]));
      return [
        {
          type: 'details',
          attrs: { id, open: input.open ?? true },
          content: [
            {
              type: 'detailsSummary',
              ...(summary.length && { content: summary }),
            },
            { type: 'detailsContent', content: inner },
          ],
        },
      ];
    }
    case 'columns': {
      const columns = (input.children ?? []).map((c) =>
        c.type === 'column' ? c : { type: 'column' as const, children: [c] },
      );
      const count = columns.length;
      if (!COLUMN_LAYOUTS[count]) {
        throw new BlockInputError('Columns need 2 to 5 column children');
      }
      return [
        {
          type: 'columns',
          attrs: { id, layout: COLUMN_LAYOUTS[count] },
          content: children(columns),
        },
      ];
    }
    case 'column': {
      const inner = children(input.children);
      if (inner.length === 0) inner.push(paragraph(spansOf(input)));
      return [
        {
          type: 'column',
          attrs: { id, ...(input.width && { width: input.width }) },
          content: inner,
        },
      ];
    }
    case 'image': {
      const ref = input.attachment_id ? attachmentOf(input, ctx) : null;
      const src = ref ? attachmentUrl(ref) : input.url;
      if (!src)
        throw new BlockInputError('An image needs a url or attachment_id');
      return [
        {
          type: 'image',
          attrs: {
            id,
            src,
            align: input.align ?? 'center',
            ...(input.caption && { alt: input.caption }),
            ...(input.width && { width: input.width }),
            ...(ref && { attachmentId: ref.id, size: ref.fileSize }),
          },
        },
      ];
    }
    case 'math':
      return [{ type: 'mathBlock', attrs: { id, text: input.latex ?? '' } }];
    case 'video': {
      const ref = input.attachment_id ? attachmentOf(input, ctx) : null;
      const src = ref ? attachmentUrl(ref) : input.url;
      if (!src)
        throw new BlockInputError('A video needs a url or attachment_id');
      return [
        {
          type: 'video',
          attrs: {
            id,
            src,
            align: input.align ?? 'center',
            ...(input.width && { width: input.width }),
            ...(ref && { attachmentId: ref.id, size: ref.fileSize }),
          },
        },
      ];
    }
    case 'file': {
      const ref = attachmentOf(input, ctx);
      return [
        {
          type: 'attachment',
          attrs: {
            id,
            url: attachmentUrl(ref),
            name: ref.fileName,
            mime: ref.mimeType,
            size: ref.fileSize,
            attachmentId: ref.id,
          },
        },
      ];
    }
    case 'embed': {
      const { provider } = getEmbedUrlAndProvider(input.url ?? '');
      if (!input.url || provider === 'iframe') {
        throw new BlockInputError(
          'Embeds must be a link from a known provider (YouTube, Vimeo, Loom, Figma, Miro, Airtable, Typeform, Framer, Google Drive/Sheets)',
        );
      }
      return [{ type: 'embed', attrs: { id, src: input.url, provider } }];
    }
  }
  return [];
}

export function previewOf(block: DocBlock): string {
  if (block.rich_text) return plainText(block.rich_text);
  if (block.text) return block.text;
  return block.preview ?? '';
}
