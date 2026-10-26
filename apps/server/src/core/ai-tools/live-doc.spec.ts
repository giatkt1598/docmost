import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { tiptapExtensions } from '../../collaboration/collaboration.util';
import { applyToLiveDoc, readDocWithIds } from './live-doc';
import { blockRev } from './blocks/doc-blocks';

const para = (id: string | null, text: string) => ({
  type: 'paragraph',
  attrs: id ? { id } : {},
  content: [{ type: 'text', text }],
});

function ydocOf(content: any[]): Y.Doc {
  return TiptapTransformer.toYdoc(
    { type: 'doc', content },
    'default',
    tiptapExtensions,
  );
}

const json = (ydoc: Y.Doc) => TiptapTransformer.fromYdoc(ydoc, 'default');
const texts = (ydoc: Y.Doc) =>
  json(ydoc).content.map((n: any) =>
    (n.content ?? []).map((t: any) => t.text).join(''),
  );

describe('live document', () => {
  it('adds missing ids once and keeps them', () => {
    const ydoc = ydocOf([para(null, 'a'), para('b', 'b')]);
    const first = readDocWithIds(ydoc);
    expect(first.content[0].attrs.id).toBeTruthy();
    expect(first.content[1].attrs.id).toBe('b');
    const update = Y.encodeStateAsUpdate(ydoc);
    const second = readDocWithIds(ydoc);
    expect(second.content[0].attrs.id).toBe(first.content[0].attrs.id);
    // nothing written the second time
    expect(Y.encodeStateAsUpdate(ydoc)).toEqual(update);
  });

  it('writes only what changed', () => {
    const ydoc = ydocOf([para('p1', 'one'), para('p2', 'two')]);
    readDocWithIds(ydoc);
    const untouched = ydoc.getXmlFragment('default').get(1);
    const result = applyToLiveDoc(
      ydoc,
      [{ op: 'update', block_id: 'p1', patch: { text: 'ONE' } }],
      { markdown: new Map() },
    );
    expect(result.ok).toBe(true);
    expect(texts(ydoc)).toEqual(['ONE', 'two']);
    // the other block is the very same Yjs element
    expect(ydoc.getXmlFragment('default').get(1)).toBe(untouched);
  });

  it('keeps what someone else typed meanwhile in another block', () => {
    const server = ydocOf([para('p1', 'one'), para('p2', 'two')]);
    readDocWithIds(server);
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));

    // the user types in p2 while the AI edits p1
    const clientText = client.getXmlFragment('default').get(1) as Y.XmlElement;
    (clientText.get(0) as Y.XmlText).insert(3, ' more');
    const result = applyToLiveDoc(
      server,
      [{ op: 'update', block_id: 'p1', patch: { text: 'ONE' } }],
      { markdown: new Map() },
    );
    expect(result.ok).toBe(true);

    Y.applyUpdate(server, Y.encodeStateAsUpdate(client));
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    expect(texts(server)).toEqual(['ONE', 'two more']);
    expect(texts(client)).toEqual(['ONE', 'two more']);
  });

  it('reports a conflict without writing', () => {
    const ydoc = ydocOf([para('p1', 'one')]);
    readDocWithIds(ydoc);
    const update = Y.encodeStateAsUpdate(ydoc);
    const result = applyToLiveDoc(
      ydoc,
      [{ op: 'update', block_id: 'p1', rev: 'stale000', patch: { text: 'x' } }],
      { markdown: new Map() },
    );
    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(Y.encodeStateAsUpdate(ydoc)).toEqual(update);
  });

  it('undoes an edit exactly', () => {
    const ydoc = ydocOf([para('p1', 'one'), para('p2', 'two')]);
    const before = readDocWithIds(ydoc);
    const result = applyToLiveDoc(
      ydoc,
      [
        {
          op: 'insert',
          after_id: 'p1',
          blocks: [{ type: 'callout', variant: 'warning', text: 'Careful' }],
        },
        {
          op: 'update',
          block_id: 'p2',
          rev: blockRev(before.content[1]),
          patch: { text: 'TWO' },
        },
      ],
      { markdown: new Map() },
    );
    if (result.ok === false) throw new Error(result.message);
    const undo = applyToLiveDoc(ydoc, result.inverse, {
      markdown: new Map(),
      mode: 'undo',
    });
    expect(undo.ok).toBe(true);
    expect(json(ydoc)).toEqual(before);
  });
});
