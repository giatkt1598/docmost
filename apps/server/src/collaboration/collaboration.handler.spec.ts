import { Hocuspocus } from '@hocuspocus/server';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import { CollaborationHandler } from './collaboration.handler';
import { tiptapExtensions } from './collaboration.util';

describe('CollaborationHandler.localizeMedia', () => {
  it('points only the matching external nodes at the copy', async () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://e.com/a.png' } },
        {
          type: 'image',
          attrs: { src: 'https://e.com/a.png', attachmentId: 'already-ours' },
        },
        { type: 'image', attrs: { src: 'https://e.com/other.png' } },
        { type: 'attachment', attrs: { url: 'https://e.com/a.png' } },
      ],
    };
    const seed = TiptapTransformer.toYdoc(content, 'default', tiptapExtensions);
    const hocuspocus = new Hocuspocus({
      quiet: true,
      extensions: [
        {
          async onLoadDocument({ document }) {
            Y.applyUpdate(document, Y.encodeStateAsUpdate(seed));
            return document;
          },
        },
      ],
    } as any);

    const handlers = new CollaborationHandler().getHandlers(hocuspocus);
    let stored: any;
    hocuspocus.configuration.extensions.push({
      async onStoreDocument({ document }) {
        stored = TiptapTransformer.fromYdoc(document, 'default');
      },
    } as any);

    const counts = await handlers.localizeMedia('page.1', {
      replacements: [
        {
          url: 'https://e.com/a.png',
          src: '/api/files/att-1/a.png',
          attachmentId: 'att-1',
          size: 10,
          fileName: 'a.png',
          mimeType: 'image/png',
        },
      ],
    });

    expect(counts).toEqual({ 'https://e.com/a.png': 2 });
    const doc =
      stored ??
      TiptapTransformer.fromYdoc(
        hocuspocus.documents.get('page.1') as any,
        'default',
      );
    const [first, second, third, fourth] = doc.content;
    expect(first.attrs).toMatchObject({
      src: '/api/files/att-1/a.png',
      attachmentId: 'att-1',
      size: 10,
    });
    expect(second.attrs).toMatchObject({
      src: 'https://e.com/a.png',
      attachmentId: 'already-ours',
    });
    expect(third.attrs.src).toBe('https://e.com/other.png');
    expect(fourth.attrs).toMatchObject({
      url: '/api/files/att-1/a.png',
      attachmentId: 'att-1',
      name: 'a.png',
      mime: 'image/png',
    });
  });
});
