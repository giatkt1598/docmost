import { applyOperations, EditError, Operation } from './engine';
import { assignBlockIds, blockRev, toDocBlock } from '../blocks/doc-blocks';
import { checkPageSchema } from '../page-schema';
import { PmNode } from '../blocks/rich-text';

const p = (id: string, text: string, extra: Record<string, any> = {}) => ({
  type: 'paragraph',
  attrs: { id, indent: 0, textAlign: null, dir: null, ...extra },
  content: [{ type: 'text', text }],
});

function fixture(): PmNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { id: 'h1', level: 2, indent: 0, textAlign: null, dir: null },
        content: [{ type: 'text', text: 'Results' }],
      },
      p('p1', 'First', { textAlign: 'center' }),
      {
        type: 'bulletList',
        attrs: { id: 'l1' },
        content: [
          {
            type: 'listItem',
            attrs: { id: 'i1' },
            content: [p('ip1', 'one')],
          },
          {
            type: 'listItem',
            attrs: { id: 'i2' },
            content: [p('ip2', 'two')],
          },
        ],
      },
      {
        type: 'callout',
        attrs: { id: 'c1', type: 'info' },
        content: [p('cp1', 'note')],
      },
      p('p2', 'Last'),
    ],
  };
}

const opts = {
  markdownToNodes: () => [],
  checkSchema: checkPageSchema,
};

const find = (doc: PmNode, id: string): PmNode | undefined => {
  for (const c of doc.content ?? []) {
    if (c.attrs?.id === id) return c;
    const inner = find(c, id);
    if (inner) return inner;
  }
  return undefined;
};

const ids = (doc: PmNode) => (doc.content ?? []).map((c) => c.attrs?.id);

describe('block ids', () => {
  it('fills missing and duplicate ids and leaves good ones alone', () => {
    const doc = {
      type: 'doc',
      content: [
        p('a', 'x'),
        p('a', 'y'),
        { type: 'horizontalRule', attrs: {} },
      ],
    };
    const first = assignBlockIds(doc);
    expect(first.changed).toBe(true);
    const [a, b, hr] = first.doc.content;
    expect(a.attrs.id).toBe('a');
    expect(b.attrs.id).not.toBe('a');
    expect(hr.attrs.id).toBeTruthy();
    const second = assignBlockIds(first.doc);
    expect(second.changed).toBe(false);
    expect(second.doc).toBe(first.doc);
  });
});

describe('DocBlock mapping', () => {
  it('reads containers, list items and callouts', () => {
    const blocks = fixture().content.map((n) => toDocBlock(n, 2));
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'bulleted_list',
      'callout',
      'paragraph',
    ]);
    expect(blocks[2].children.map((c) => [c.type, c.rich_text])).toEqual([
      ['list_item', [{ text: 'one' }]],
      ['list_item', [{ text: 'two' }]],
    ]);
    expect(blocks[3].variant).toBe('info');
    expect(blocks[3].children[0].id).toBe('cp1');
  });

  it('summarises children below the depth', () => {
    const block = toDocBlock(fixture().content[2], 0);
    expect(block.children).toBeUndefined();
    expect(block).toMatchObject({ has_children: true, child_count: 2 });
  });
});

describe('applyOperations', () => {
  it('inserts after a block and can undo it', () => {
    const doc = fixture();
    const result = applyOperations(
      doc,
      [
        {
          op: 'insert',
          after_id: 'h1',
          blocks: [
            { type: 'heading', level: 3, text: 'Risks' },
            { type: 'bulleted_list', items: ['Late data', 'No reviewer'] },
          ],
        },
      ],
      opts,
    );
    expect(result.doc.content.length).toBe(7);
    expect(result.doc.content[1].type).toBe('heading');
    expect(result.doc.content[2].content.length).toBe(2);
    expect(result.changedIds.length).toBe(2);

    const undone = applyOperations(result.doc, result.inverse, {
      ...opts,
      mode: 'undo',
    });
    expect(undone.doc).toEqual(doc);
  });

  it('updates text but keeps the other attributes', () => {
    const doc = fixture();
    const rev = blockRev(find(doc, 'p1'));
    const result = applyOperations(
      doc,
      [
        {
          op: 'update',
          block_id: 'p1',
          rev,
          patch: { rich_text: [{ text: 'Bold', bold: true }] },
        },
      ],
      opts,
    );
    const p1 = find(result.doc, 'p1');
    expect(p1.attrs.textAlign).toBe('center');
    expect(p1.content).toEqual([
      { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
    ]);
    const undone = applyOperations(result.doc, result.inverse, {
      ...opts,
      mode: 'undo',
    });
    expect(undone.doc).toEqual(doc);
  });

  it('turns a paragraph into a heading', () => {
    const result = applyOperations(
      fixture(),
      [{ op: 'update', block_id: 'p2', patch: { type: 'heading', level: 3 } }],
      opts,
    );
    expect(find(result.doc, 'p2')).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
    });
  });

  it('moves a block into a callout and back on undo', () => {
    const doc = fixture();
    const result = applyOperations(
      doc,
      [{ op: 'move', block_id: 'p2', parent_id: 'c1', after_id: 'cp1' }],
      opts,
    );
    expect(ids(result.doc)).toEqual(['h1', 'p1', 'l1', 'c1']);
    expect(find(result.doc, 'c1').content.map((c) => c.attrs.id)).toEqual([
      'cp1',
      'p2',
    ]);
    const undone = applyOperations(result.doc, result.inverse, {
      ...opts,
      mode: 'undo',
    });
    expect(undone.doc).toEqual(doc);
  });

  it('deletes a list item and puts it back on undo', () => {
    const doc = fixture();
    const result = applyOperations(
      doc,
      [{ op: 'delete', block_id: 'i1' }],
      opts,
    );
    expect(find(result.doc, 'l1').content.map((c) => c.attrs.id)).toEqual([
      'i2',
    ]);
    const undone = applyOperations(result.doc, result.inverse, {
      ...opts,
      mode: 'undo',
    });
    expect(undone.doc).toEqual(doc);
  });

  it('refuses a stale rev with CONFLICT and changes nothing', () => {
    const doc = fixture();
    const copy = JSON.parse(JSON.stringify(doc));
    const run = () =>
      applyOperations(
        doc,
        [
          { op: 'insert', after_id: 'h1', blocks: [{ type: 'divider' }] },
          { op: 'delete', block_id: 'p1', rev: 'deadbeef' },
        ],
        opts,
      );
    expect(run).toThrow(EditError);
    try {
      run();
    } catch (err) {
      expect((err as EditError).code).toBe('CONFLICT');
      expect((err as EditError).details[0]).toMatchObject({
        op_index: 1,
        block_id: 'p1',
      });
    }
    expect(doc).toEqual(copy);
  });

  it('refuses invalid placements', () => {
    const cases: Operation[] = [
      {
        op: 'insert',
        parent_id: 'l1',
        blocks: [{ type: 'paragraph', text: 'x' }],
      },
      {
        op: 'insert',
        parent_id: 'p1',
        blocks: [{ type: 'paragraph', text: 'x' }],
      },
      { op: 'move', block_id: 'i1', parent_id: null, after_id: 'h1' },
      { op: 'move', block_id: 'c1', parent_id: 'cp1' },
    ];
    for (const op of cases) {
      expect(() => applyOperations(fixture(), [op], opts)).toThrow(EditError);
    }
  });

  it('refuses ragged tables and results the editor schema rejects', () => {
    expect(() =>
      applyOperations(
        fixture(),
        [
          {
            op: 'insert',
            blocks: [
              {
                type: 'table',
                header_row: true,
                rows: [
                  [[{ text: 'A' }], [{ text: 'B' }]],
                  [[{ text: 'only one' }]],
                ],
              },
            ],
          },
        ],
        opts,
      ),
    ).toThrow(/same number of cells/);
    // an empty list is not a valid page
    expect(() =>
      applyOperations(
        fixture(),
        [
          { op: 'delete', block_id: 'i1' },
          { op: 'delete', block_id: 'i2' },
        ],
        opts,
      ),
    ).toThrow(/not a valid page/);
  });

  it('undo refuses when the user changed the block afterwards', () => {
    const result = applyOperations(
      fixture(),
      [{ op: 'update', block_id: 'p1', patch: { text: 'AI text' } }],
      opts,
    );
    const userEdited = JSON.parse(JSON.stringify(result.doc));
    find(userEdited, 'p1').content = [{ type: 'text', text: 'user text' }];
    expect(() =>
      applyOperations(userEdited, result.inverse, { ...opts, mode: 'undo' }),
    ).toThrow(/changed after the AI edit/);
  });

  it('refuses updates that do not fit the block', () => {
    expect(() =>
      applyOperations(
        fixture(),
        [{ op: 'update', block_id: 'c1', patch: { text: 'x' } }],
        opts,
      ),
    ).toThrow(/callout block has no text/);
  });

  it('refuses unsafe links and content the tools do not create', () => {
    expect(() =>
      applyOperations(
        fixture(),
        [
          {
            op: 'insert',
            blocks: [
              {
                type: 'paragraph',
                rich_text: [{ text: 'x', link: 'javascript:alert(1)' }],
              },
            ],
          },
        ],
        opts,
      ),
    ).toThrow(/Unsafe link/);
    expect(() =>
      applyOperations(
        fixture(),
        [{ op: 'insert', blocks: [{ type: 'markdown', markdown: 'img' }] }],
        {
          ...opts,
          markdownToNodes: () => [
            { type: 'image', attrs: { src: 'https://x.io/a.png' } },
          ],
        },
      ),
    ).toThrow(/image blocks cannot be created/);
  });

  it('keeps a mention and a comment that are echoed back, refuses new ones', () => {
    const mention = {
      type: 'mention',
      attrs: { id: 'm1', label: 'Ann', entityType: 'user', entityId: 'u1' },
    };
    const comment = {
      type: 'comment',
      attrs: { commentId: 'c9', resolved: false },
    };
    const doc: any = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'p1' },
          content: [{ type: 'text', text: 'Hi ', marks: [comment] }, mention],
        },
      ],
    };
    const kept = applyOperations(
      doc,
      [
        {
          op: 'update',
          block_id: 'p1',
          patch: {
            rich_text: [
              { text: 'Hello ', extra_marks: [comment] },
              { inline: mention, preview: '@Ann' },
            ],
          },
        },
      ],
      opts,
    );
    expect(kept.doc.content[0].content[1]).toEqual(mention);

    expect(() =>
      applyOperations(
        doc,
        [
          {
            op: 'update',
            block_id: 'p1',
            patch: {
              rich_text: [
                {
                  inline: {
                    ...mention,
                    attrs: { ...mention.attrs, entityId: 'u2' },
                  },
                  preview: '@Bob',
                },
              ],
            },
          },
        ],
        opts,
      ),
    ).toThrow(/mention can only be kept/);
    expect(() =>
      applyOperations(
        doc,
        [
          {
            op: 'update',
            block_id: 'p1',
            patch: {
              rich_text: [
                {
                  text: 'x',
                  extra_marks: [
                    { type: 'comment', attrs: { commentId: 'new' } },
                  ],
                },
              ],
            },
          },
        ],
        opts,
      ),
    ).toThrow(/Comments cannot be added/);
  });
});
