import { Readability } from '@mozilla/readability';
import { Cheerio, CheerioAPI, load } from 'cheerio';
import { Window } from 'happy-dom';

export type WebPageMode = 'article' | 'full';

export type ExtractedWebPage = {
  title: string | null;
  html: string;
  textLength: number;
  imageCount: number;
};

// Below this much text Readability probably picked the wrong block (or the
// page is rendered by JavaScript), so callers try harder.
export const MIN_ARTICLE_TEXT = 200;

const LAZY_SRC_ATTRS = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-actualsrc',
  'data-hi-res-src',
  'data-url',
];
const LAZY_SRCSET_ATTRS = ['data-srcset', 'data-lazy-srcset'];

// Chrome around the content; dropped in full-page mode (Readability does its own).
const PAGE_CHROME = [
  'script',
  'style',
  'noscript',
  'template',
  'link',
  'meta',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'dialog',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[aria-hidden="true"]',
  '[hidden]',
].join(',');

/**
 * Turns a fetched web page into HTML the import pipeline understands: the main
 * article (or the whole body), absolute URLs and real image sources.
 */
export function extractWebPage(
  rawHtml: string,
  pageUrl: string,
  mode: WebPageMode,
): ExtractedWebPage {
  const $ = load(rawHtml);
  const title = pickTitle($);
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();

  absolutizeUrls($, pageUrl);
  resolveLazyImages($);
  unwrapHeadings($);

  let html: string | null = null;
  let articleTitle: string | null = null;
  if (mode === 'article') {
    const article = runReadability($, pageUrl);
    if (article && textLengthOf(article.content) >= MIN_ARTICLE_TEXT) {
      html = article.content;
      articleTitle = article.title?.trim() || null;
    }
  }

  if (html === null) {
    const $body: Cheerio<any> = $('body').length ? $('body') : $.root();
    $body.find(PAGE_CHROME).remove();
    html = $body.html() ?? '';
  }

  const $out = load(html, null, false);
  cleanContent($out, $out.root());
  const out = $out.html() ?? '';

  // "Article - Site name": the page's own <h1> is the cleaner title
  let finalTitle = articleTitle || title;
  if (h1 && finalTitle?.includes(h1)) finalTitle = h1;

  return {
    title: finalTitle,
    html: out,
    textLength: textLengthOf(out),
    imageCount: $out('img').length,
  };
}

function pickTitle($: CheerioAPI): string | null {
  const candidates = [
    $('meta[property="og:title"]').attr('content'),
    $('meta[name="twitter:title"]').attr('content'),
    $('title').first().text(),
    $('h1').first().text(),
  ];
  for (const c of candidates) {
    const t = c?.replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 250);
  }
  return null;
}

function absolutizeUrls($: CheerioAPI, pageUrl: string) {
  const base = $('base[href]').attr('href');
  let baseUrl = pageUrl;
  try {
    if (base) baseUrl = new URL(base, pageUrl).toString();
  } catch {
    // keep the page URL
  }

  const resolve = (value: string | undefined): string | null => {
    const v = value?.trim();
    if (!v || v.startsWith('data:') || v.startsWith('#')) return v ?? null;
    try {
      const url = new URL(v, baseUrl);
      if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  };

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href')!.trim();
    // in-page anchors point at the original page
    const resolved = href.startsWith('#')
      ? resolve(pageUrl.split('#')[0] + href)
      : resolve(href);
    if (resolved) $el.attr('href', resolved);
    else $el.removeAttr('href');
  });

  for (const attr of ['src', 'poster', ...LAZY_SRC_ATTRS]) {
    $(
      `img[${attr}], video[${attr}], audio[${attr}], source[${attr}], iframe[${attr}]`,
    ).each((_, el) => {
      const $el = $(el);
      const resolved = resolve($el.attr(attr));
      if (resolved) $el.attr(attr, resolved);
      else $el.removeAttr(attr);
    });
  }

  for (const attr of ['srcset', ...LAZY_SRCSET_ATTRS]) {
    $(`img[${attr}], source[${attr}]`).each((_, el) => {
      const $el = $(el);
      const candidates = parseSrcset($el.attr(attr)!)
        .map((c) => ({ ...c, url: resolve(c.url) }))
        .filter((c) => c.url);
      $el.attr(
        attr,
        candidates.map((c) => `${c.url} ${c.descriptor}`.trim()).join(', '),
      );
    });
  }
}

function resolveLazyImages($: CheerioAPI) {
  // <noscript><img></noscript> is the real image behind a lazy placeholder
  $('noscript').each((_, el) => {
    const $el = $(el);
    const inner = $el.text() || $el.html() || '';
    if (!/<img\b/i.test(inner)) return;
    const $prev = $el.prev('img');
    if ($prev.length && hasRealSrc($prev.attr('src'))) {
      $el.remove();
      return;
    }
    $prev.remove();
    $el.replaceWith(inner);
  });

  $('picture').each((_, el) => {
    const $picture = $(el);
    const $img = $picture.find('img').first();
    if (!$img.length) {
      $picture.remove();
      return;
    }
    if (!hasRealSrc($img.attr('src'))) {
      const srcset =
        $picture.find('source[srcset]').first().attr('srcset') ??
        $picture.find('source[data-srcset]').first().attr('data-srcset');
      const best = srcset ? largestCandidate(srcset) : null;
      if (best) $img.attr('src', best);
    }
    $picture.replaceWith($img);
  });

  $('img').each((_, el) => {
    const $img = $(el);
    let src = $img.attr('src');

    if (!hasRealSrc(src)) {
      const lazy = LAZY_SRC_ATTRS.map((a) => $img.attr(a)).find(hasRealSrc);
      if (lazy) src = lazy;
    }

    // prefer the sharpest candidate the page offers
    const srcset =
      LAZY_SRCSET_ATTRS.map((a) => $img.attr(a)).find(Boolean) ??
      $img.attr('srcset');
    const best = srcset ? largestCandidate(srcset) : null;
    if (best && (!hasRealSrc(src) || /\d+w\b/.test(srcset!))) src = best;

    if (!hasRealSrc(src)) {
      $img.remove();
      return;
    }
    $img.attr('src', src!);
    for (const a of [
      'srcset',
      'sizes',
      'loading',
      ...LAZY_SRC_ATTRS,
      ...LAZY_SRCSET_ATTRS,
    ]) {
      $img.removeAttr(a);
    }
  });
}

// Wrappers like <div class="mw-heading"><h2>…</h2><span>[edit]</span></div>
// look like link clutter to Readability, which then drops the heading too.
function unwrapHeadings($: CheerioAPI) {
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const $heading = $(el);
    const $parent = $heading.parent();
    if (
      !$parent.is('div') ||
      $parent.children('h1, h2, h3, h4, h5, h6').length !== 1
    ) {
      return;
    }
    const onlyInlineSiblings = $parent
      .children()
      .not(el)
      .toArray()
      .every((c: any) =>
        ['span', 'a', 'small', 'sup', 'button'].includes(c.name),
      );
    const extra = $parent.text().length - $heading.text().length;
    if (onlyInlineSiblings && extra <= 30) $parent.replaceWith($heading);
  });
}

function runReadability(
  $: CheerioAPI,
  pageUrl: string,
): { title: string | null; content: string } | null {
  // Readability strips classes; keep the ones code blocks use for language
  const languageClasses = new Set<string>();
  $('pre[class], code[class]').each((_, el) => {
    for (const c of ($(el).attr('class') ?? '').split(/\s+/)) {
      if (/^(language|lang)-/.test(c)) languageClasses.add(c);
    }
  });

  const window = new Window({ url: pageUrl });
  try {
    const doc = new window.DOMParser().parseFromString($.html(), 'text/html');
    const article = new Readability(doc as unknown as Document, {
      charThreshold: MIN_ARTICLE_TEXT,
      classesToPreserve: [...languageClasses],
    }).parse();
    if (!article?.content) return null;
    return { title: article.title ?? null, content: article.content };
  } catch {
    return null;
  } finally {
    window.happyDOM.abort();
    window.happyDOM.close();
  }
}

function cleanContent($: CheerioAPI, $root: Cheerio<any>) {
  $root.find('script, style, noscript, template, link, meta').remove();

  // tracking pixels and spacer images
  $root.find('img').each((_, el) => {
    const $img = $(el);
    const w = Number($img.attr('width'));
    const h = Number($img.attr('height'));
    if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) $img.remove();
  });

  // Highlighters wrap tokens in spans and lines in divs/<p>; the code block
  // wants plain text, and reads the language from the <code> class.
  $root.find('pre').each((_, el) => {
    const $pre = $(el);
    const $code = $pre.children('code').first();
    const lang =
      languageOf($code.attr('class')) ?? languageOf($pre.attr('class'));
    const $newCode = $('<code></code>').text(codeText(el).replace(/\n+$/, ''));
    if (lang) $newCode.addClass(`language-${lang}`);
    $pre.empty().append($newCode);
  });

  // links that only wrapped an icon or nothing at all
  $root.find('a').each((_, el) => {
    const $a = $(el);
    if (!$a.text().trim() && !$a.find('img').length) $a.remove();
  });

  // Site markup must not trip Docmost's own parse rules (e.g. any
  // <li data-id> parses as a footnote, which then lacks its required id).
  $root.find('*').each((_, el: any) => {
    for (const name of Object.keys(el.attribs ?? {})) {
      if (name === 'class') {
        const lang = languageOf(el.attribs.class);
        if (lang && el.name === 'code') el.attribs.class = `language-${lang}`;
        else delete el.attribs.class;
      } else if (!KEPT_ATTRIBUTES.includes(name)) {
        delete el.attribs[name];
      }
    }
  });
}

const KEPT_ATTRIBUTES = [
  'href',
  'src',
  'alt',
  'title',
  'colspan',
  'rowspan',
  'start',
  'poster',
  'controls',
];

const CODE_LINE_TAGS = ['div', 'p', 'li', 'tr'];

function codeText(node: any): string {
  if (node.type === 'text') return node.data ?? '';
  if (node.name === 'br') return '\n';
  let text = '';
  for (const child of node.children ?? []) text += codeText(child);
  if (CODE_LINE_TAGS.includes(node.name) && !text.endsWith('\n')) text += '\n';
  return text;
}

function languageOf(className: string | undefined): string | null {
  for (const c of (className ?? '').split(/\s+/)) {
    const m = /^(?:language|lang)-(.+)$/.exec(c);
    if (m) return m[1];
  }
  return null;
}

function hasRealSrc(src: string | undefined): boolean {
  const v = src?.trim();
  if (!v) return false;
  // inline placeholders (blank gifs, blurred svgs) lazy loaders swap out
  if (v.startsWith('data:'))
    return v.length > 1000 && !v.startsWith('data:image/svg');
  return !/(^|\/)(blank|spacer|placeholder|transparent|pixel)\.(gif|png|svg)/i.test(
    v,
  );
}

type SrcsetCandidate = { url: string; descriptor: string };

function parseSrcset(srcset: string): SrcsetCandidate[] {
  return srcset
    .split(/,\s+(?=\S)/)
    .map((part) => {
      const [url, descriptor = ''] = part.trim().split(/\s+/, 2);
      return { url, descriptor };
    })
    .filter((c) => c.url);
}

function largestCandidate(srcset: string): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const { url, descriptor } of parseSrcset(srcset)) {
    if (!hasRealSrc(url)) continue;
    const m = /^([\d.]+)([wx])$/.exec(descriptor);
    // width descriptors beat density ones; a bare url counts as 1x
    const score = m ? Number(m[1]) * (m[2] === 'x' ? 1000 : 1) : 1000;
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return best;
}

function textLengthOf(html: string): number {
  return load(html).root().text().replace(/\s+/g, ' ').trim().length;
}
