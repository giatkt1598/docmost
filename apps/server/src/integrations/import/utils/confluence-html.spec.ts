import {
  convertConfluenceHtml,
  pageTitleFromHtml,
  parentFromBreadcrumbs,
  parseIndexTree,
} from './confluence-html';

const INDEX = `
<html><body><div id="content"><h2>Available pages:</h2>
<ul>
  <li><a href="Home_1.html">Home</a>
    <ul>
      <li><a href="Tr%E1%BA%A3i%20nghi%E1%BB%87m_2.html">Trải nghiệm</a>
        <ul><li><a href="Deep_4.html">Deep</a></li></ul>
      </li>
      <li><a href="Second_3.html">Second</a></li>
    </ul>
  </li>
</ul></div></body></html>`;

describe('parseIndexTree', () => {
  it('reads the nested page list in order, decoding file names', () => {
    expect(parseIndexTree(INDEX)).toEqual([
      {
        href: 'Home_1.html',
        title: 'Home',
        children: [
          {
            href: 'Trải nghiệm_2.html',
            title: 'Trải nghiệm',
            children: [{ href: 'Deep_4.html', title: 'Deep', children: [] }],
          },
          { href: 'Second_3.html', title: 'Second', children: [] },
        ],
      },
    ]);
  });

  it('returns nothing when there is no list', () => {
    expect(parseIndexTree('<html><body>none</body></html>')).toEqual([]);
  });
});

describe('breadcrumbs and titles', () => {
  const page = `<html><head><title>DOCS : My page : part</title></head><body>
    <ol id="breadcrumbs"><li><a href="index.html">DOCS</a></li>
    <li><a href="Home_1.html">Home</a></li>
    <li><a href="Mid_2.html">Mid</a></li>
    <li><a href="My-page_5.html">My page</a></li></ol>
    <h1 id="title-heading"><span id="title-text">DOCS : My page : part</span></h1></body></html>`;

  it('finds the parent, skipping the page itself and the index', () => {
    expect(parentFromBreadcrumbs(page, 'My-page_5.html')).toBe('Mid_2.html');
  });

  it('drops the space prefix from the title', () => {
    expect(pageTitleFromHtml(page)).toBe('My page : part');
  });
});

describe('convertConfluenceHtml', () => {
  const wrap = (inner: string) =>
    `<html><body><div id="header">nav</div><div id="main-content" class="wiki-content group">${inner}</div><div id="footer">foot</div></body></html>`;

  it('keeps only the content and leads with the title', () => {
    const { html } = convertConfluenceHtml(wrap('<p>Body</p>'), 'My page');
    expect(html).toBe('<h1>My page</h1><p>Body</p>');
  });

  it('turns information macros into callouts', () => {
    const { html } = convertConfluenceHtml(
      wrap(
        '<div class="confluence-information-macro confluence-information-macro-warning conf-macro output-block"><span class="aui-icon aui-icon-small aui-iconfont-error confluence-information-macro-icon"></span><div class="confluence-information-macro-body"><p>Careful</p></div></div>' +
          '<div class="confluence-information-macro confluence-information-macro-tip"><div class="confluence-information-macro-body"><p>Nice</p></div></div>',
      ),
      'T',
    );
    expect(html).toContain(
      '<div data-type="callout" data-callout-type="warning"><p>Careful</p></div>',
    );
    expect(html).toContain('data-callout-type="success"');
  });

  it('turns code panels into code blocks with their language', () => {
    const { html } = convertConfluenceHtml(
      wrap(
        '<div class="code panel pdl conf-macro output-block"><div class="codeContent panelContent pdl"><pre class="syntaxhighlighter-pre" data-syntaxhighlighter-params="brush: java; gutter: false" data-theme="Confluence">int a = 1 &lt; 2;</pre></div></div>',
      ),
      'T',
    );
    expect(html).toContain(
      '<pre><code class="language-java">int a = 1 &lt; 2;</code></pre>',
    );
  });

  it('turns expand macros into details', () => {
    const { html } = convertConfluenceHtml(
      wrap(
        '<div class="expand-container conf-macro output-block"><div class="expand-control"><span class="expand-control-icon icon">&nbsp;</span><span class="expand-control-text conf-macro output-inline">More</span></div><div class="expand-content expand-hidden"><p>Hidden</p></div></div>',
      ),
      'T',
    );
    expect(html).toContain(
      '<details><summary>More</summary><div data-type="detailsContent"><p>Hidden</p></div></details>',
    );
  });

  it('turns task lists, emoticons, people and statuses', () => {
    const { html } = convertConfluenceHtml(
      wrap(
        '<ul class="inline-task-list"><li data-inline-task-id="1">Todo</li><li class="checked" data-inline-task-id="2">Done</li></ul>' +
          '<p><img class="emoticon emoticon-tick" data-emoticon-name="tick" src="images/icons/emoticons/check.svg" alt="(tick)"> ok <a class="confluence-userlink user-mention" data-username="a" href="/x">An Nguyen</a> <span class="status-macro aui-lozenge aui-lozenge-success">DONE</span></p>',
      ),
      'T',
    );
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    expect(html).toContain('✅');
    expect(html).toContain('<span>An Nguyen</span>');
    expect(html).toContain(
      '<span data-type="status" data-color="green">DONE</span>',
    );
    expect(html).not.toContain('<img');
  });

  it('collects attachments with their real names and cleans the links', () => {
    const { html, attachments } = convertConfluenceHtml(
      wrap(
        '<span class="confluence-embedded-file-wrapper"><img class="confluence-embedded-image" src="attachments/123/456.png?version=1&amp;api=v2" data-image-src="attachments/123/456.png?version=1&amp;api=v2" data-linked-resource-type="attachment" data-linked-resource-default-alias="shot.png" data-linked-resource-content-type="image/png"></span>' +
          '<p><a href="attachments/123/789.pdf?api=v2" data-linked-resource-type="attachment" data-linked-resource-default-alias="Guide.pdf" data-linked-resource-content-type="application/pdf">Guide.pdf</a> <a href="Other_9.html">other</a></p>',
      ),
      'T',
    );
    expect(attachments).toEqual([
      {
        href: 'attachments/123/456.png',
        fileName: 'shot.png',
        mimeType: 'image/png',
      },
      {
        href: 'attachments/123/789.pdf',
        fileName: 'Guide.pdf',
        mimeType: 'application/pdf',
      },
    ]);
    expect(html).toContain(
      '<img class="confluence-embedded-image" src="attachments/123/456.png"',
    );
    expect(html).toContain('<a href="Other_9.html">other</a>');
    expect(html).not.toContain('confluence-embedded-file-wrapper');
  });

  it('keeps tables and unwraps layout', () => {
    const { html } = convertConfluenceHtml(
      wrap(
        '<div class="contentLayout2"><div class="columnLayout two-equal"><div class="cell normal"><div class="innerCell"><div class="table-wrap"><table class="confluenceTable"><colgroup><col></colgroup><tbody><tr><th class="confluenceTh">A</th></tr><tr><td class="confluenceTd">B</td></tr></tbody></table></div></div></div></div></div>',
      ),
      'T',
    );
    expect(html).toContain('<table class="confluenceTable"><tbody>');
    expect(html).toContain('<th class="confluenceTh">A</th>');
    expect(html).not.toContain('contentLayout2');
    expect(html).not.toContain('colgroup');
  });
});
