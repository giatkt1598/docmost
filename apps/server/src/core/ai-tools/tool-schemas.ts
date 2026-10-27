import { z } from 'zod';
import { CALLOUT_VARIANTS, IMAGE_ALIGNS } from './blocks/doc-blocks';
import { isSafeLink, STATUS_COLORS } from './blocks/rich-text';

// Input schemas of the AI page tools, shared by AI chat and the MCP server.

const PAGE_ID = z
  .string()
  .min(1)
  .max(300)
  .describe('Page id, slug id or page URL');
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
  z.object({ math: z.string().max(2000).describe('inline LaTeX formula') }),
  z.object({
    status: z
      .object({
        text: z.string().min(1).max(60),
        color: z.enum(STATUS_COLORS).optional(),
      })
      .describe('coloured status label'),
  }),
  z.object({
    mention: z
      .object({
        page_id: z.string().max(100).optional(),
        user_id: z.string().max(100).optional(),
      })
      .describe('Mention a page (page_id) or a workspace member (user_id)'),
  }),
]);

// a plain string is accepted wherever formatted text is expected
const richText = z
  .union([
    z.string().max(20_000),
    z.array(z.union([z.string().max(10_000), spanSchema])).max(500),
  ])
  .describe(
    'Text: a plain string, or spans [{ text, bold?, italic?, underline?, strike?, code?, link? }]',
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
  'toggle',
  'columns',
  'column',
  'image',
  'file',
  'embed',
  'math',
  'video',
  'mermaid',
  'drawio',
  'markdown',
] as const;

export const blockInputSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z
      .enum(BLOCK_TYPES)
      .optional()
      .describe(
        'Required, except for list items inside items/children of a list',
      ),
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
      .describe(
        'table: rows of cells (each cell a string or spans), every row the same width; the first row is the header when header_row is true',
      ),
    items: z
      .array(z.union([z.string().max(10_000), blockInputSchema]))
      .max(200)
      .optional()
      .describe(
        'lists: items as strings, or objects { text | rich_text, checked? (todo), children? }',
      ),
    open: z.boolean().optional().describe('toggle: expanded'),
    width: z
      .union([z.number(), z.string().max(20)])
      .nullable()
      .optional()
      .describe('image width in px, column width ratio'),
    url: z
      .string()
      .max(2000)
      .refine(isSafeLink, 'Must be an http(s) link')
      .optional()
      .describe('image or embed link'),
    attachment_id: z
      .uuid()
      .optional()
      .describe('image/file: a file already uploaded to the workspace'),
    caption: z.string().max(500).nullable().optional().describe('image'),
    latex: z.string().max(5000).optional().describe('math: LaTeX'),
    source: z
      .string()
      .max(20_000)
      .optional()
      .describe('mermaid: the diagram source (flowchart, sequenceDiagram...)'),
    xml: z
      .string()
      .max(500_000)
      .optional()
      .describe('drawio: an <mxGraphModel> (or <mxfile>) describing the diagram'),
    title: z.string().max(200).optional().describe('drawio: name of the diagram'),
    align: z.enum(IMAGE_ALIGNS).nullable().optional().describe('image'),
    children: z
      .array(z.union([z.string().max(20_000), blockInputSchema]))
      .max(100)
      .optional()
      .describe(
        'quote, callout, toggle, column, list items: blocks inside; columns: 2-5 column blocks',
      ),
    markdown: z
      .string()
      .max(20_000)
      .optional()
      .describe(
        'type "markdown": Markdown expanded into blocks (also read from "text")',
      ),
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
  cells: z
    .array(
      z.object({
        row: z.number().int().min(0),
        col: z.number().int().min(0),
        rich_text: richText.optional(),
        text: z.string().max(10_000).optional(),
      }),
    )
    .max(200)
    .optional()
    .describe('table: change single cells (0-based)'),
  open: z.boolean().optional(),
  width: z
    .union([z.number(), z.string().max(20)])
    .nullable()
    .optional(),
  caption: z.string().max(500).nullable().optional(),
  align: z.enum(IMAGE_ALIGNS).nullable().optional(),
  latex: z.string().max(5000).optional(),
  source: z.string().max(20_000).optional().describe('mermaid'),
  xml: z.string().max(500_000).optional().describe('drawio: the new diagram'),
  title: z.string().max(200).optional().describe('drawio'),
  url: z
    .string()
    .max(2000)
    .refine(isSafeLink, 'Must be an http(s) link')
    .optional(),
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
  get_diagram: z.object({
    page_id: PAGE_ID,
    block_id: BLOCK_ID.describe('A mermaid or drawio block'),
  }),
  list_page_history: z.object({
    page_id: PAGE_ID,
    limit: z.number().int().min(1).max(50).optional(),
  }),
  restore_page_version: z.object({
    page_id: PAGE_ID,
    history_id: z.uuid().describe('A version from list_page_history'),
    summary: SUMMARY,
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
  get_diagram:
    'Read the source of a diagram block: Mermaid text or draw.io XML (to change it, update the block with a new source or xml).',
  list_page_history:
    'List earlier versions of a page, newest first: when, by whom, and for AI edits what they changed.',
  restore_page_version:
    'Put the whole content of a page back to an earlier version. Only when the user asks for it. It is recorded as an AI edit and can be undone while nobody changes the page.',
  undo_ai_edit:
    'Undo one earlier AI edit. Refused when someone changed the same blocks afterwards.',
};

const EXAMPLES = [
  '{"type":"heading","level":2,"text":"Plan"}',
  '{"type":"paragraph","rich_text":[{"text":"Due ","bold":true},{"text":"Friday"},{"mention":{"user_id":"<user uuid>"}}]}',
  '{"type":"callout","variant":"warning","text":"Check the numbers"}',
  '{"type":"bulleted_list","items":["One","Two"]}',
  '{"type":"todo_list","items":[{"text":"Draft","checked":true},{"text":"Review"}]}',
  '{"type":"table","header_row":true,"rows":[["Name","Owner"],["API","Ann"],["UI","Bob"]]}',
  '{"type":"columns","children":[{"type":"column","children":[{"type":"paragraph","text":"Left"}]},{"type":"column","children":["Right"]}]}',
  '{"type":"toggle","text":"Details","children":["Hidden text"]}',
  '{"type":"code","language":"ts","text":"const a = 1;"}',
  '{"type":"image","url":"https://example.com/chart.png","caption":"Chart"}',
  '{"type":"markdown","markdown":"## Notes\\n- a\\n- b"}',
  '{"type":"mermaid","source":"flowchart LR\\n  A[Start] --> B{Ok?}\\n  B -->|yes| C[Done]"}',
  '{"type":"drawio","title":"Flow","xml":"<mxGraphModel><root><mxCell id=\\"0\\"/><mxCell id=\\"1\\" parent=\\"0\\"/><mxCell id=\\"a\\" value=\\"Start\\" style=\\"rounded=1;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"20\\" y=\\"20\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell><mxCell id=\\"b\\" value=\\"End\\" style=\\"ellipse;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"220\\" y=\\"20\\" width=\\"100\\" height=\\"60\\" as=\\"geometry\\"/></mxCell><mxCell id=\\"e\\" edge=\\"1\\" parent=\\"1\\" source=\\"a\\" target=\\"b\\"><mxGeometry relative=\\"1\\" as=\\"geometry\\"/></mxCell></root></mxGraphModel>"}',
];

export const BLOCK_GUIDE = [
  'Blocks: paragraph, heading (level 1-3), quote, callout (variant default|info|note|success|warning|danger), code (language, text), divider,',
  'bulleted_list / numbered_list (items or list_item children), todo_list (todo_item with checked), table (header_row, rows of cells; update single cells with patch.cells),',
  'toggle (rich_text summary, open, children), columns (2-5 column children, each with children), image (url or attachment_id, caption, align), file (attachment_id), embed (url of YouTube, Vimeo, Loom, Figma, Miro, Airtable, Typeform, Framer, Google Drive/Sheets),',
  'math (latex), video (url or attachment_id), mermaid (source: Mermaid diagram, rendered in the page), drawio (xml: draw.io mxGraphModel, editable in draw.io; read it back with get_diagram),',
  'and type "markdown" to insert longer Markdown at once. Text is rich_text spans or plain "text"; a span { mention: { page_id } } or { mention: { user_id } } links a page or a person, { math: "E=mc^2" } is an inline formula and { status: { text, color: gray|blue|green|yellow|red } } a status label.',
  'Blocks of type "unsupported" (drawings, complex tables...) can be moved or deleted but not edited.',
  'An image from an external URL is copied into the workspace, so reading it back shows a /api/files/... url.',
  `Examples: ${EXAMPLES.join(' ')}`,
].join(' ');
