import { applyOperations } from './engine';
import { toDocBlock } from '../blocks/doc-blocks';
import { checkPageSchema } from '../page-schema';
import { PmNode } from '../blocks/rich-text';

const opts = {
  markdownToNodes: () => [],
  checkSchema: checkPageSchema,
  attachments: new Map([
    [
      'v1',
      { id: 'v1', fileName: 'demo.mp4', mimeType: 'video/mp4', fileSize: 9 },
    ],
  ]),
};

const doc = (): PmNode => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { id: 'p1' },
      content: [{ type: 'text', text: 'One' }],
    },
    {
      type: 'paragraph',
      attrs: { id: 'p2' },
      content: [{ type: 'text', text: 'Two' }],
    },
  ],
});

describe('math, video, status and whole-page restore', () => {
  it('creates math blocks, videos and inline formulas and labels', () => {
    const result = applyOperations(
      doc(),
      [
        {
          op: 'insert',
          blocks: [
            { type: 'math', latex: 'E=mc^2' },
            { type: 'video', attachment_id: 'v1' },
            {
              type: 'paragraph',
              rich_text: [
                { text: 'Area ' },
                { math: '\pi r^2' },
                { text: ' ' },
                { status: { text: 'Done', color: 'green' } },
              ],
            },
          ],
        },
      ],
      opts,
    );
    const [math, video, para] = result.doc.content;
    expect(math).toMatchObject({
      type: 'mathBlock',
      attrs: { text: 'E=mc^2' },
    });
    expect(video.attrs).toMatchObject({
      src: '/api/files/v1/demo.mp4',
      attachmentId: 'v1',
    });
    expect(toDocBlock(para).rich_text).toEqual([
      { text: 'Area ' },
      { math: '\pi r^2' },
      { text: ' ' },
      { status: { text: 'Done', color: 'green' } },
    ]);
    expect(toDocBlock(math)).toMatchObject({ type: 'math', latex: 'E=mc^2' });
  });

  it('restores a whole earlier version and undoes it only if nothing changed', () => {
    const before = doc();
    const version: PmNode = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { id: 'h9', level: 2 },
          content: [{ type: 'text', text: 'Old' }],
        },
      ],
    };
    const result = applyOperations(
      before,
      [{ op: 'replace_document', node: version }],
      opts,
    );
    expect(result.doc.content).toEqual(version.content);

    const undone = applyOperations(result.doc, result.inverse, {
      ...opts,
      mode: 'undo',
    });
    expect(undone.doc).toEqual(before);

    const touched = JSON.parse(JSON.stringify(result.doc));
    touched.content[0].content[0].text = 'Edited later';
    expect(() =>
      applyOperations(touched, result.inverse, { ...opts, mode: 'undo' }),
    ).toThrow(/changed after the version was restored/);
  });
});
