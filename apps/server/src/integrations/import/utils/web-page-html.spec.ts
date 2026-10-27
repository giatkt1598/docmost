import { load } from 'cheerio';
import { extractWebPage } from './web-page-html';
import { decodeHtml } from '../services/web-page-fetcher.service';

const paragraph = (n: number) =>
  `<p>Đoạn văn số ${n} có đủ chữ để Readability coi đây là nội dung chính của bài viết, không phải phần menu hay quảng cáo bên lề.</p>`;

function articlePage(body: string, head = '') {
  return `<!doctype html><html><head><title>Tiêu đề bài - Báo ABC</title>${head}</head>
<body>
  <nav><a href="/">Trang chủ</a><a href="/the-thao">Thể thao</a></nav>
  <article>
    <h1>Tiêu đề bài</h1>
    ${paragraph(1)}${paragraph(2)}
    ${body}
    ${paragraph(3)}${paragraph(4)}
  </article>
  <footer>Bản quyền © Báo ABC</footer>
</body></html>`;
}

describe('extractWebPage', () => {
  const url = 'https://news.example.com/a/b/bai-viet.html';

  it('keeps the article and drops navigation and footer', () => {
    const page = extractWebPage(articlePage(''), url, 'article');
    expect(page.html).toContain('Đoạn văn số 1');
    expect(page.html).not.toContain('Thể thao');
    expect(page.html).not.toContain('Bản quyền');
    expect(page.title).toBe('Tiêu đề bài');
  });

  it('prefers og:title when there is no article title', () => {
    const page = extractWebPage(
      `<html><head><meta property="og:title" content="OG title"></head><body><p>x</p></body></html>`,
      url,
      'full',
    );
    expect(page.title).toBe('OG title');
  });

  it('makes links and images absolute', () => {
    const page = extractWebPage(
      articlePage(
        `<p><a href="../khac.html">liên kết</a> <a href="#muc-2">mục 2</a> <a href="javascript:void(0)">js</a></p>
         <img src="/img/anh.jpg" alt="ảnh">`,
      ),
      url,
      'article',
    );
    const $ = load(page.html);
    expect($('a:contains("liên kết")').attr('href')).toBe(
      'https://news.example.com/a/khac.html',
    );
    expect($('a:contains("mục 2")').attr('href')).toBe(`${url}#muc-2`);
    expect($('a:contains("js")').attr('href')).toBeUndefined();
    expect($('img').attr('src')).toBe('https://news.example.com/img/anh.jpg');
  });

  it('resolves lazy-loaded images, srcset and <picture>', () => {
    const page = extractWebPage(
      articlePage(
        `<figure><img src="data:image/gif;base64,R0lGOD" data-src="/lazy.jpg" alt="lazy"></figure>
         <figure><img src="/small.jpg" srcset="/small.jpg 320w, /large.jpg 1280w, /mid.jpg 640w" alt="set"></figure>
         <figure><picture><source srcset="/pic.webp 800w"><img alt="pic"></picture></figure>
         <figure><img class="lazy" src="/blank.gif" alt="ns"><noscript><img src="/real.jpg" alt="ns"></noscript></figure>`,
      ),
      url,
      'article',
    );
    const srcs = load(page.html)('img')
      .map((_, el) => load(el)('img').attr('src'))
      .get();
    expect(srcs).toEqual(
      expect.arrayContaining([
        'https://news.example.com/lazy.jpg',
        'https://news.example.com/large.jpg',
        'https://news.example.com/pic.webp',
        'https://news.example.com/real.jpg',
      ]),
    );
    expect(page.html).not.toContain('blank.gif');
    expect(page.html).not.toContain('data:image/gif');
  });

  it('turns highlighted code into a <pre><code> with its language', () => {
    const page = extractWebPage(
      articlePage(
        `<pre class="language-ts"><span class="k">const</span> a = <span>1</span>;</pre>
         <pre><code class="language-python">print("hi")</code></pre>`,
      ),
      url,
      'article',
    );
    const $ = load(page.html);
    expect($('code.language-ts').text()).toBe('const a = 1;');
    expect($('code.language-python').text()).toBe('print("hi")');
  });

  it('keeps line breaks of code split into per-line elements', () => {
    const page = extractWebPage(
      articlePage(
        `<pre><code class="language-js"><div class="line"><span>if</span> (a) {</div><div class="line">  b();<br></div><div>}</div></code></pre>`,
      ),
      url,
      'article',
    );
    expect(load(page.html)('code.language-js').text()).toBe(
      'if (a) {\n  b();\n}',
    );
  });

  it('strips site attributes that would match Docmost nodes', () => {
    const page = extractWebPage(
      `<html><body><ul><li data-id="1006" class="menu" style="color:red">Mục</li></ul></body></html>`,
      url,
      'full',
    );
    expect(page.html).toBe('<ul><li>Mục</li></ul>');
  });

  it('keeps headings wrapped with edit links', () => {
    const page = extractWebPage(
      articlePage(
        `<div class="mw-heading"><h2 id="ls">Lịch sử</h2><span class="mw-editsection">[<a href="/edit">sửa</a>]</span></div>${paragraph(5)}`,
      ),
      url,
      'article',
    );
    expect(load(page.html)('h2').text()).toBe('Lịch sử');
    expect(page.html).not.toContain('sửa');
  });

  it('drops tracking pixels', () => {
    const page = extractWebPage(
      articlePage(
        `<img src="https://t.example.com/p.gif" width="1" height="1">`,
      ),
      url,
      'article',
    );
    expect(page.html).not.toContain('t.example.com');
  });

  it('full mode keeps the whole body minus page chrome', () => {
    const page = extractWebPage(
      `<html><body><nav>menu</nav><div><h2>Bảng giá</h2><table><tr><td>A</td><td>1</td></tr></table></div><script>alert(1)</script></body></html>`,
      url,
      'full',
    );
    expect(page.html).toContain('<table>');
    expect(page.html).not.toContain('menu');
    expect(page.html).not.toContain('alert');
  });

  it('falls back to the body when Readability finds no article', () => {
    const page = extractWebPage(
      `<html><body><div><p>Ngắn thôi.</p></div></body></html>`,
      url,
      'article',
    );
    expect(page.html).toContain('Ngắn thôi.');
    expect(page.textLength).toBe('Ngắn thôi.'.length);
  });
});

describe('decodeHtml', () => {
  it('uses the charset from the header', () => {
    const body = Buffer.from([0x63, 0x61, 0x66, 0xe9]); // "café" in latin1
    expect(decodeHtml(body, 'text/html; charset=ISO-8859-1')).toBe('café');
  });

  it('falls back to <meta charset>', () => {
    const body = Buffer.concat([
      Buffer.from('<meta charset="windows-1252"><p>'),
      Buffer.from([0x93, 0x68, 0x69, 0x94]),
    ]);
    expect(decodeHtml(body, 'text/html')).toContain('“hi”');
  });

  it('defaults to UTF-8', () => {
    expect(decodeHtml(Buffer.from('Tiếng Việt'), '')).toBe('Tiếng Việt');
  });
});
