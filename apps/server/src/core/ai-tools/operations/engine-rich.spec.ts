import { applyOperations } from './engine';
import { blockRev, toDocBlock } from '../blocks/doc-blocks';
import { checkPageSchema } from '../page-schema';
import { PmNode } from '../blocks/rich-text';

const p = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});

function fixture(): PmNode {
  return {
    type: 'doc',
    content: [
      p('p1', 'Intro'),
      {
        type: 'details',
        attrs: { id: 't1', open: true },
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'More' }] },
          { type: 'detailsContent', content: [p('tp1', 'Hidden')] },
        ],
      },
      {
        type: 'table',
        attrs: { id: 'tb1' },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { colspan: 2, rowspan: 1 },
                content: [p('cp1', 'wide')],
              },
            ],
          },
        ],
      },
    ],
  };
}

const attachments = new Map([
  [
    'att1',
    {
      id: 'att1',
      fileName: 'plan.pdf',
      mimeType: 'application/pdf',
      fileSize: 12,
    },
  ],
]);

const opts = {
  markdownToNodes: () => [],
  checkSchema: checkPageSchema,
  attachments,
};

const find = (doc: PmNode, id: string): PmNode | undefined => {
  for (const c of doc.content ?? []) {
    if (c.attrs?.id === id) return c;
    const inner = find(c, id);
    if (inner) return inner;
  }
  return undefined;
};

describe('toggles, columns, media and mentions', () => {
  it('reads a toggle with its summary and children', () => {
    const block = toDocBlock(fixture().content[1], 1);
    expect(block).toMatchObject({
      type: 'toggle',
      open: true,
      rich_text: [{ text: 'More' }],
    });
    expect(block.children[0].id).toBe('tp1');
  });

  it('inserts into a toggle, updates its summary and undoes it all', () => {
    const doc = fixture();
    const result = applyOperations(
      doc,
      [
        {
          op: 'insert',
          parent_id: 't1',
          after_id: 'tp1',
          blocks: [{ type: 'paragraph', text: 'Added' }],
        },
        {
          op: 'update',
          block_id: 't1',
          patch: { text: 'Details', open: false },
        },
      ],
      opts,
    );
    const toggle = find(result.doc, 't1');
    expect(toggle.attrs.open).toBe(false);
    expect(toggle.content[0].content[0].text).toBe('Details');
    expect(toggle.content[1].content.map((c) => c.content[0].text)).toEqual([
      'Hidden',
      'Added',
    ]);
    const undone = applyOperations(result.doc, result.inverse, {
      ...opts,
      mode: 'undo',
    });
    expect(undone.doc).toEqual(doc);
  });

  it('creates columns with the right layout, and moves a block into one', () => {
    const result = applyOperations(
      fixture(),
      [
        {
          op: 'insert',
          after_id: 'p1',
          blocks: [
            {
              type: 'columns',
              children: [
                {
                  type: 'column',
                  children: [{ type: 'paragraph', text: 'Left' }],
                },
                {
                  type: 'column',
                  children: [{ type: 'paragraph', text: 'Mid' }],
                },
                { type: 'paragraph', text: 'Right' },
              ],
            },
          ],
        },
      ],
      opts,
    );
    const columns = result.doc.content[1];
    expect(columns.type).toBe('columns');
    expect(columns.attrs.layout).toBe('three_equal');
    const firstColumn = columns.content[0].attrs.id;
    const moved = applyOperations(
      result.doc,
      [{ op: 'move', block_id: 'p1', parent_id: firstColumn }],
      opts,
    );
    expect(find(moved.doc, firstColumn).content[0].attrs.id).toBe('p1');
  });

  it('refuses a single column and columns inside columns', () => {
    expect(() =>
      applyOperations(
        fixture(),
        [
          {
            op: 'insert',
            blocks: [{ type: 'columns', children: [{ type: 'column' }] }],
          },
        ],
        opts,
      ),
    ).toThrow(/2 to 5 column/);
  });

  it('adds an image by url and a file from the workspace', () => {
    const result = applyOperations(
      fixture(),
      [
        {
          op: 'insert',
          blocks: [
            {
              type: 'image',
              url: 'https://img.example/a.png',
              caption: 'Chart',
            },
            { type: 'file', attachment_id: 'att1' },
            {
              type: 'embed',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            },
          ],
        },
      ],
      opts,
    );
    const [image, file, embed] = result.doc.content;
    expect(image).toMatchObject({
      type: 'image',
      attrs: {
        src: 'https://img.example/a.png',
        alt: 'Chart',
        align: 'center',
      },
    });
    expect(file).toMatchObject({
      type: 'attachment',
      attrs: {
        url: '/api/files/att1/plan.pdf',
        name: 'plan.pdf',
        attachmentId: 'att1',
      },
    });
    expect(embed.attrs.provider).toBe('youtube');
    expect(toDocBlock(file)).toMatchObject({ type: 'file', name: 'plan.pdf' });
  });

  it('refuses unknown files and arbitrary iframes', () => {
    expect(() =>
      applyOperations(
        fixture(),
        [{ op: 'insert', blocks: [{ type: 'file', attachment_id: 'nope' }] }],
        opts,
      ),
    ).toThrow(/not available to you/);
    expect(() =>
      applyOperations(
        fixture(),
        [
          {
            op: 'insert',
            blocks: [{ type: 'embed', url: 'https://evil.example/x' }],
          },
        ],
        opts,
      ),
    ).toThrow(/known provider/);
  });

  it('only creates mentions that were checked beforehand', () => {
    const mention = {
      type: 'mention',
      attrs: { id: 'm1', label: 'Plan', entityType: 'page', entityId: 'pg1' },
    };
    const insert = () =>
      applyOperations(
        fixture(),
        [
          {
            op: 'insert',
            blocks: [
              {
                type: 'paragraph',
                rich_text: [
                  { text: 'See ' },
                  { inline: mention, preview: '@Plan' },
                ],
              },
            ],
          },
        ],
        { ...opts, trustedInline: [] },
      );
    expect(insert).toThrow(/mention can only be added/);
    const ok = applyOperations(
      fixture(),
      [
        {
          op: 'insert',
          blocks: [
            {
              type: 'paragraph',
              rich_text: [{ inline: mention, preview: '@Plan' }],
            },
          ],
        },
      ],
      { ...opts, trustedInline: [mention] },
    );
    expect(ok.doc.content[0].content[0]).toEqual(mention);
  });

  it('changes single table cells', () => {
    const doc: PmNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: { id: 'tb' },
          content: [0, 1].map((r) => ({
            type: 'tableRow',
            content: [0, 1].map((c) => ({
              type: r === 0 ? 'tableHeader' : 'tableCell',
              attrs: { colspan: 1, rowspan: 1 },
              content: [p(`c${r}${c}`, `${r}${c}`)],
            })),
          })),
        },
      ],
    };
    const result = applyOperations(
      doc,
      [
        {
          op: 'update',
          block_id: 'tb',
          rev: blockRev(doc.content[0]),
          patch: { cells: [{ row: 1, col: 0, text: 'changed' }] },
        },
      ],
      opts,
    );
    expect(toDocBlock(result.doc.content[0]).rows).toEqual([
      [[{ text: '00' }], [{ text: '01' }]],
      [[{ text: 'changed' }], [{ text: '11' }]],
    ]);
    expect(() =>
      applyOperations(
        doc,
        [
          {
            op: 'update',
            block_id: 'tb',
            patch: { cells: [{ row: 5, col: 0, text: 'x' }] },
          },
        ],
        opts,
      ),
    ).toThrow(/no cell at row 5/);
  });

  it('leaves blocks inside complex tables alone', () => {
    expect(toDocBlock(fixture().content[2]).type).toBe('unsupported');
    expect(() =>
      applyOperations(fixture(), [{ op: 'delete', block_id: 'cp1' }], opts),
    ).toThrow(/cannot change; delete that block instead/);
    // the whole table can still go
    expect(() =>
      applyOperations(fixture(), [{ op: 'delete', block_id: 'tb1' }], opts),
    ).not.toThrow();
  });
});
