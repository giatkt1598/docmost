import { InputShapeError, normalizeOperations } from './normalize';
import { applyOperations } from './engine';
import { checkPageSchema } from '../page-schema';

describe('normalizeOperations', () => {
  it('turns the shapes models write into the strict ones', () => {
    const [op] = normalizeOperations([
      {
        op: 'insert',
        blocks: [
          { type: 'paragraph', rich_text: 'Plain' },
          {
            type: 'todo_list',
            items: [{ text: 'Draft', checked: true }, 'Review'],
          },
          {
            type: 'table',
            header_row: true,
            rows: [
              ['A', 'B'],
              ['1', [{ text: '2', bold: true }]],
            ],
          },
          { type: 'quote', children: ['Inside'] },
          { type: 'bulleted_list', children: [{ text: 'One' }] },
          { type: 'markdown', text: '## Notes' },
        ],
      },
    ]) as any;
    expect(op.blocks[0].rich_text).toEqual([{ text: 'Plain' }]);
    expect(op.blocks[1].items[0]).toEqual({
      type: 'todo_item',
      text: 'Draft',
      checked: true,
    });
    expect(op.blocks[2].rows).toEqual([
      [[{ text: 'A' }], [{ text: 'B' }]],
      [[{ text: '1' }], [{ text: '2', bold: true }]],
    ]);
    expect(op.blocks[3].children[0]).toEqual({
      type: 'paragraph',
      text: 'Inside',
    });
    expect(op.blocks[4].children[0]).toEqual({
      type: 'list_item',
      text: 'One',
    });
    expect(op.blocks[5]).toEqual({ type: 'markdown', markdown: '## Notes' });
  });

  it('names the path of a block without a type', () => {
    expect(() =>
      normalizeOperations([{ op: 'insert', blocks: [{ text: 'x' }] }]),
    ).toThrow(InputShapeError);
    try {
      normalizeOperations([{ op: 'insert', blocks: [{ text: 'x' }] }]);
    } catch (err) {
      expect((err as InputShapeError).path).toBe('operations.0.blocks.0');
    }
  });

  it('the normalised batch applies, and an empty markdown block is an error', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'p1' } }],
    };
    const ops = normalizeOperations([
      {
        op: 'insert',
        after_id: 'p1',
        blocks: [
          { type: 'todo_list', items: [{ text: 'a', checked: true }] },
          { type: 'table', header_row: true, rows: [['A'], ['1']] },
          { type: 'markdown', text: 'md' },
        ],
      },
    ]);
    const md = [
      {
        type: 'paragraph',
        attrs: { id: 'x' },
        content: [{ type: 'text', text: 'md' }],
      },
    ];
    const result = applyOperations(doc, ops, {
      markdownToNodes: (m) => (m === 'md' ? md : []),
      checkSchema: checkPageSchema,
    });
    // the markdown paragraph is reported like any other new block
    expect(result.changedIds).toHaveLength(3);
    expect(() =>
      applyOperations(
        doc,
        normalizeOperations([
          { op: 'insert', blocks: [{ type: 'markdown', text: '' }] },
        ]),
        { markdownToNodes: () => [], checkSchema: checkPageSchema },
      ),
    ).toThrow(/produced no content/);
  });
});
