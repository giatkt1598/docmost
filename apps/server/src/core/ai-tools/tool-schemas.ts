import { z } from 'zod';
import { CALLOUT_VARIANTS } from './blocks/doc-blocks';
import { isSafeLink } from './blocks/rich-text';

// Input schemas of the AI page tools, shared by AI chat and the MCP server.

const PAGE_ID = z.string().min(1).max(100).describe('Page id or slug id');
const BLOCK_ID = z.string().min(1).max(64);
const REV = z
  .string()
  .max(16)
  .describe('The rev the block had when you read it; detects concurrent edits');
const SUMMARY = z
  .string()
  .min(1)
  .max(300)
  .describe(
    'One short sentence saying what this change does, shown in page history',
  );

const textSpan = z.object({
  text: z.string().max(10_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  code: z.boolean().optional(),
  link: z
    .string()
    .max(2000)
    .refine(isSafeLink, 'Links must be http(s), mailto or a /path')
    .optional(),
  extra_marks: z
    .array(z.any())
    .max(10)
    .optional()
    .describe('Copy as is from what you read; never write your own'),
});

export const spanSchema = z.union([
  textSpan,
  z.object({ hard_break: z.literal(true) }),
  z.object({
    inline: z.any().describe('Copy as is from what you read'),
    preview: z.string().optional(),
  }),
]);

const richText = z
  .array(spanSchema)
  .max(500)
  .describe(
    'Formatted text: [{ text, bold?, italic?, underline?, strike?, code?, link? }]',
  );

const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'quote',
  'callout',
  'code',
  'divider',
  'bulleted_list',
  'numbered_list',
  'list_item',
  'todo_list',
  'todo_item',
  'table',
  'markdown',
] as const;

export const blockInputSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum(BLOCK_TYPES),
    rich_text: richText.optional(),
    text: z
      .string()
      .max(20_000)
      .optional()
      .describe('Plain text instead of rich_text; for code blocks, the code'),
    level: z.number().int().min(1).max(3).optional().describe('heading level'),
    checked: z.boolean().optional().describe('todo_item'),
    language: z.string().max(40).nullable().optional().describe('code'),
    variant: z.enum(CALLOUT_VARIANTS).optional().describe('callout colour'),
    icon: z.string().max(40).nullable().optional().describe('callout emoji'),
    start: z.number().int().min(1).optional().describe('numbered_list'),
    header_row: z.boolean().optional().describe('table'),
    rows: z
      .array(z.array(richText).max(30))
      .max(200)
      .optional()
      .describe('table: rows of cells, every row the same width'),
    items: z
      .array(z.union([z.string().max(10_000), richText, blockInputSchema]))
      .max(200)
      .optional()
      .describe('lists: items as strings, rich text or item blocks'),
    children: z
      .array(blockInputSchema)
      .max(100)
      .optional()
      .describe('quote, callout, list items: blocks inside'),
    markdown: z
      .string()
      .max(20_000)
      .optional()
      .describe('type "markdown": Markdown expanded into blocks'),
  }),
);

const patchSchema = z.object({
  type: z
    .enum(['paragraph', 'heading'])
    .optional()
    .describe('switch between paragraph and heading'),
  rich_text: richText.optional(),
  text: z.string().max(20_000).optional(),
  level: z.number().int().min(1).max(3).optional(),
  checked: z.boolean().optional(),
  language: z.string().max(40).nullable().optional(),
  variant: z.enum(CALLOUT_VARIANTS).optional(),
  icon: z.string().max(40).nullable().optional(),
  start: z.number().int().min(1).optional(),
  header_row: z.boolean().optional(),
  rows: z.array(z.array(richText).max(30)).max(200).optional(),
});

const parentAndPosition = {
  parent_id: BLOCK_ID.nullable()
    .optional()
    .describe('Container block, or null/omitted for the page itself'),
  after_id: BLOCK_ID.nullable()
    .optional()
    .describe('Sibling to place after; null/omitted for the first position'),
};

export const operationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('insert'),
    ...parentAndPosition,
    blocks: z.array(blockInputSchema).min(1).max(100),
  }),
  z.object({
    op: z.literal('update'),
    block_id: BLOCK_ID,
    rev: REV,
    patch: patchSchema,
  }),
  z.object({
    op: z.literal('move'),
    block_id: BLOCK_ID,
    rev: REV,
    ...parentAndPosition,
  }),
  z.object({ op: z.literal('delete'), block_id: BLOCK_ID, rev: REV }),
]);

export const pageToolSchemas = {
  get_page_outline: z.object({ page_id: PAGE_ID }),
  get_blocks: z.object({
    page_id: PAGE_ID,
    parent_id: BLOCK_ID.nullable()
      .optional()
      .describe('Read the children of this block; omit for the page'),
    start: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    depth: z
      .number()
      .int()
      .min(0)
      .max(4)
      .optional()
      .describe('How many levels of children to include (default 1)'),
  }),
  find_blocks: z.object({
    page_id: PAGE_ID,
    query: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(30).optional(),
  }),
  apply_operations: z.object({
    page_id: PAGE_ID,
    summary: SUMMARY,
    operations: z.array(operationSchema).min(1).max(50),
  }),
  insert_blocks: z.object({
    page_id: PAGE_ID,
    summary: SUMMARY,
    ...parentAndPosition,
    blocks: z.array(blockInputSchema).min(1).max(100),
  }),
  update_block: z.object({
    page_id: PAGE_ID,
    summary: SUMMARY,
    block_id: BLOCK_ID,
    rev: REV,
    patch: patchSchema,
  }),
  move_block: z.object({
    page_id: PAGE_ID,
    summary: SUMMARY,
    block_id: BLOCK_ID,
    rev: REV,
    ...parentAndPosition,
  }),
  delete_blocks: z.object({
    page_id: PAGE_ID,
    summary: SUMMARY,
    blocks: z
      .array(z.object({ block_id: BLOCK_ID, rev: REV }))
      .min(1)
      .max(50),
  }),
  undo_ai_edit: z.object({
    edit_id: z.uuid().describe('The edit_id a write returned'),
  }),
};

export const PAGE_TOOL_DESCRIPTIONS: Record<
  keyof typeof pageToolSchemas,
  string
> = {
  get_page_outline:
    'Start here before editing a page: title, path, whether you may edit, and its headings with block ids.',
  get_blocks:
    'Read blocks of a page as typed JSON with id and rev, a slice at a time (start/limit), optionally the children of one block.',
  find_blocks:
    'Find blocks whose text contains a phrase, with where they sit (parents, the heading above, neighbours). Use it on long pages instead of reading everything.',
  apply_operations:
    'Change a page with a batch of block operations, all or nothing: insert, update (only the fields of that block), move, delete. Pass the rev you read for every block you change; if a block changed meanwhile you get CONFLICT and should read again. Returns the changed blocks and an edit_id for undo.',
  insert_blocks:
    'Insert blocks after a sibling (or first) in the page or a container block.',
  update_block:
    "Change one block's own content or settings (text, level, checked, code, callout colour, table cells). Children are changed with insert/move/delete, never here.",
  move_block:
    'Move a block (with its children) to another position or container.',
  delete_blocks: 'Delete blocks (with their children).',
  undo_ai_edit:
    'Undo one earlier AI edit. Refused when someone changed the same blocks afterwards.',
};

export const BLOCK_GUIDE = [
  'Blocks: paragraph, heading (level 1-3), quote, callout (variant default|info|note|success|warning|danger), code (language, text), divider,',
  'bulleted_list / numbered_list (items or list_item children), todo_list (todo_item with checked), table (header_row, rows of cells),',
  'and type "markdown" to insert longer Markdown at once. Text is rich_text spans or plain "text".',
  'Blocks of type "unsupported" (images, columns, embeds...) can be moved or deleted but not edited.',
].join(' ');
