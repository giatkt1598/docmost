import { escapeHtml, toHighlightHtml } from './typesense.service';

describe('typesense highlight', () => {
  it('escapes page text', () => {
    expect(escapeHtml('<b onclick="x">&')).toBe(
      '&lt;b onclick=&quot;x&quot;&gt;&amp;',
    );
  });

  it('turns markers into <b> and escapes the rest', () => {
    expect(toHighlightHtml('a <script> ⟦match⟧ z')).toBe(
      'a &lt;script&gt; <b>match</b> z',
    );
  });
});
