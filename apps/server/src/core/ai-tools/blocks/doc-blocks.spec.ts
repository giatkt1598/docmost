import { BLOCK_ID_TYPES } from '@docmost/editor-ext';
import { htmlToJson } from '../../../collaboration/collaboration.util';
import { pageSchema, toPmNode } from '../page-schema';
import { BlockInput, DocBlock, fromBlockInput, toDocBlock } from './doc-blocks';
import { isSafeLink } from './rich-text';

// The editor's own output for each block type the AI tools support.
const SAMPLES: Record<string, string> = {
  paragraph:
    '<p>Plain <strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <code>c</code> <a href="https://a.io">link</a></p>',
  heading: '<h2>Title</h2>',
  quote: '<blockquote><p>Quoted</p><p>Second</p></blockquote>',
  callout:
    '<div data-type="callout" data-callout-type="warning"><p>Careful</p></div>',
  code: '<pre><code class="language-ts">const a = 1;</code></pre>',
  divider: '<hr>',
  bulleted_list:
    '<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li><li><p>Two</p></li></ul>',
  numbered_list: '<ol start="3"><li><p>Three</p></li><li><p>Four</p></li></ol>',
  todo_list:
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li><li data-type="taskItem" data-checked="false"><p>Open</p></li></ul>',
  toggle:
    '<details open><summary>More</summary><div data-type="detailsContent"><p>Inside</p></div></details>',
  columns:
    '<div data-type="columns" data-layout="two_equal"><div data-type="column"><p>Left</p></div><div data-type="column"><p>Right</p></div></div>',
  image: '<img src="https://x.io/a.png" alt="Chart" data-align="center">',
  embed:
    '<div data-type="embed" data-src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" data-provider="youtube"></div>',
  table:
    '<table><tbody><tr><th><p>H1</p></th><th><p>H2</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
};

// what a tool would send to create the same block
function asInput(block: DocBlock): BlockInput {
  const { id, rev, children, has_children, child_count, ...rest } = block;
  void id;
  void rev;
  void has_children;
  void child_count;
  return {
    ...(rest as any),
    ...(children && { children: children.map(asInput) }),
  };
}

// compare structure, not the generated ids
function withoutIds(node: any): any {
  if (Array.isArray(node)) return node.map(withoutIds);
  if (!node || typeof node !== 'object') return node;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'id') continue;
    // HTML import stores an open toggle as ""
    if (k === 'open') {
      out[k] = v === true || v === '';
      continue;
    }
    out[k] = withoutIds(v);
  }
  return out;
}

describe('schema inventory', () => {
  const schema = pageSchema();

  it('gives every block-id type an id attribute and nothing else one', () => {
    for (const type of BLOCK_ID_TYPES) {
      expect(schema.nodes[type]).toBeDefined();
      expect(Object.keys(schema.nodes[type].spec.attrs ?? {})).toContain('id');
    }
    // nodes that use `id` for their own purpose are not managed by UniqueID
    for (const type of ['tab', 'footnote', 'mention']) {
      expect(BLOCK_ID_TYPES).not.toContain(type);
    }
  });
});

describe('round trip of supported blocks', () => {
  for (const [type, html] of Object.entries(SAMPLES)) {
    it(type, () => {
      const doc = htmlToJson(html);
      const original = doc.content[0];
      const block = toDocBlock(original, 10);
      expect(block.type).toBe(type);

      const rebuilt = fromBlockInput(asInput(block), () => []);
      expect(rebuilt).toHaveLength(1);
      // normalise both through the schema so defaults line up
      const norm = (n: any) =>
        withoutIds(toPmNode({ type: 'doc', content: [n] }).toJSON().content[0]);
      expect(norm(rebuilt[0])).toEqual(norm(original));
    });
  }

  it('keeps unknown inline content and marks when echoed back', () => {
    const doc = htmlToJson(
      '<p>See <span data-type="mention" data-id="m1" data-label="Ann" data-entity-type="user" data-entity-id="u1">@Ann</span> <mark data-color="#ff0">hi</mark></p>',
    );
    const block = toDocBlock(doc.content[0]);
    const kinds = block.rich_text.map((s: any) =>
      s.inline ? 'inline' : s.extra_marks ? 'extra' : 'text',
    );
    expect(kinds).toContain('inline');
    expect(kinds).toContain('extra');
    const rebuilt = fromBlockInput(asInput(block), () => [])[0];
    expect(withoutIds(rebuilt.content)).toEqual(
      withoutIds(doc.content[0].content),
    );
  });

  it('reads complex tables as unsupported', () => {
    const doc = htmlToJson(
      '<table><tbody><tr><td colspan="2"><p>wide</p></td></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
    );
    expect(toDocBlock(doc.content[0]).type).toBe('unsupported');
  });

  it('accepts only safe links', () => {
    expect(isSafeLink('https://docmost.com')).toBe(true);
    expect(isSafeLink('/s/space/p/abc')).toBe(true);
    expect(isSafeLink('mailto:a@b.c')).toBe(true);
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('data:text/html,x')).toBe(false);
    expect(isSafeLink('//evil.com')).toBe(false);
  });
});
