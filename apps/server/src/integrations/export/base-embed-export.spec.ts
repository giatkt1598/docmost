import { htmlToMarkdown, markdownToHtml } from '@docmost/editor-ext';
import { jsonToHtml } from '../../collaboration/collaboration.util';
import {
  htmlToMarkdownKeepingBaseEmbeds,
  linkBaseEmbeds,
  remapBaseEmbeds,
} from './utils';
import { embedsBase } from '../../core/base/base-public.service';

const BASE_ID = '0198a1b2-0000-7000-8000-000000000001';
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
    { type: 'base', attrs: { pageId: BASE_ID } },
    { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
  ],
};
const link = (id: string) =>
  id === BASE_ID ? { href: 'Tasks & more.md', title: 'Tasks <1>' } : null;

describe('base embeds in exports', () => {
  it('puts an escaped link inside the embed', () => {
    const html = linkBaseEmbeds(jsonToHtml(doc), link);
    expect(html).toContain(
      `<div data-type="base-embed" data-page-id="${BASE_ID}"><a href="Tasks &amp; more.md">Tasks &lt;1&gt;</a></div>`,
    );
  });

  it('leaves the embed empty when the base is not exported', () => {
    const html = linkBaseEmbeds(jsonToHtml(doc), () => null);
    expect(html).toContain(
      `<div data-type="base-embed" data-page-id="${BASE_ID}"></div>`,
    );
  });

  it('keeps the embed through markdown and back', async () => {
    const html = linkBaseEmbeds(jsonToHtml(doc), link);
    const md = htmlToMarkdownKeepingBaseEmbeds(html, htmlToMarkdown);
    expect(md).toContain('Before');
    expect(md).toContain(`data-page-id="${BASE_ID}"`);
    expect(md).not.toContain('DOCMOSTBASEEMBED');

    const back = await markdownToHtml(md);
    expect(back).toContain(`data-type="base-embed"`);
    expect(back).toContain(`data-page-id="${BASE_ID}"`);
  });

  it('points embeds at imported pages', () => {
    const html = linkBaseEmbeds(jsonToHtml(doc), link);
    const out = remapBaseEmbeds(html, new Map([[BASE_ID, 'new-id']]));
    expect(out).toContain('data-page-id="new-id"');
    expect(out).not.toContain(BASE_ID);
  });

  it('finds embeds in nested content', () => {
    const nested = {
      type: 'doc',
      content: [{ type: 'callout', content: [doc.content[1]] }],
    };
    expect(embedsBase(nested, BASE_ID)).toBe(true);
    expect(embedsBase(nested, 'other')).toBe(false);
  });
});
