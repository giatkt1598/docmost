import { load } from 'cheerio';

// Confluence "Export space as HTML" (Cloud and Server/Data Center): reading
// the page tree and turning a page's markup into what the editor understands.
// Pure functions over strings.

export type ConfluenceTreeNode = {
  href: string;
  title: string;
  children: ConfluenceTreeNode[];
};

export type ConfluenceAttachment = {
  href: string;
  fileName: string;
  mimeType: string;
};

// hrefs in the export are URL-encoded file names
export function decodeHref(href: string): string {
  const clean = href.split('#')[0].split('?')[0];
  try {
    return decodeURIComponent(clean).replace(/^\.?\//, '');
  } catch {
    return clean.replace(/^\.?\//, '');
  }
}

// The nested list of pages in index.html, in the order Confluence shows it.
export function parseIndexTree(html: string): ConfluenceTreeNode[] {
  const $ = load(html);

  const readList = (list: any): ConfluenceTreeNode[] => {
    const nodes: ConfluenceTreeNode[] = [];
    $(list)
      .children('li')
      .each((_, li) => {
        const $li = $(li);
        const $link = $li.children('a').first().length
          ? $li.children('a').first()
          : $li.find('a').first();
        const href = $link.attr('href');
        const children = $li
          .children('ul')
          .toArray()
          .flatMap((ul) => readList(ul));
        if (href && /\.html?(#|\?|$)/i.test(href)) {
          nodes.push({
            href: decodeHref(href),
            title: $link.text().replace(/\s+/g, ' ').trim(),
            children,
          });
        } else {
          // a grouping entry without a page of its own
          nodes.push(...children);
        }
      });
    return nodes;
  };

  // the outermost list that links to pages
  const top = $('ul')
    .toArray()
    .find(
      (ul) =>
        $(ul).parents('ul, ol').length === 0 &&
        $(ul).find('a[href]').length > 0,
    );
  return top ? readList(top) : [];
}

// Parent of a page according to its breadcrumb trail, for pages missing from
// index.html. The trail starts at the space home and may end at the page.
export function parentFromBreadcrumbs(
  html: string,
  ownHref: string,
): string | null {
  const $ = load(html);
  const hrefs = $('#breadcrumbs a[href], ol.breadcrumbs a[href]')
    .toArray()
    .map((a) => decodeHref($(a).attr('href') ?? ''))
    .filter((href) => href && href.toLowerCase() !== 'index.html');
  const own = decodeHref(ownHref);
  while (hrefs.length && hrefs[hrefs.length - 1] === own) hrefs.pop();
  return hrefs.length ? hrefs[hrefs.length - 1] : null;
}

const CALLOUT_BY_MACRO: Record<string, string> = {
  information: 'info',
  note: 'note',
  tip: 'success',
  warning: 'warning',
};

const EMOJI_BY_EMOTICON: Record<string, string> = {
  smile: '🙂',
  sad: '🙁',
  cheeky: '😛',
  laugh: '😄',
  wink: '😉',
  'thumbs-up': '👍',
  'thumbs-down': '👎',
  information: 'ℹ️',
  tick: '✅',
  cross: '❌',
  warning: '⚠️',
  plus: '➕',
  minus: '➖',
  question: '❓',
  'light-on': '💡',
  'light-off': '💡',
  'yellow-star': '⭐',
  'red-star': '⭐',
  'green-star': '⭐',
  'blue-star': '⭐',
};

const STATUS_COLOR: Record<string, string> = {
  success: 'green',
  complete: 'green',
  error: 'red',
  current: 'blue',
  moved: 'yellow',
  progress: 'blue',
};

const ATTACHMENT_PATH = /^(?:\.\/)?(?:download\/)?attachments\//i;

// Maps the markup of one exported page. `title` becomes the first heading so
// the importer takes it as the page title instead of the first real heading.
export function convertConfluenceHtml(
  html: string,
  title: string,
): { html: string; attachments: ConfluenceAttachment[] } {
  const source = load(html);
  const main = source('#main-content').first();
  const body = main.length ? main.html() : source('body').html();
  const $ = load(body ?? html);

  // chrome that is not content
  $(
    'script, style, noscript, .aui-icon, .toc-macro, .plugin_pagetree, .children-display, .page-metadata, #comments-section, .comment-container, .attachments, .pageSection.group > .section-header',
  ).remove();

  // information, note, tip and warning panels
  $('.confluence-information-macro').each((_, el) => {
    const $el = $(el);
    const macro = Object.keys(CALLOUT_BY_MACRO).find((name) =>
      $el.hasClass(`confluence-information-macro-${name}`),
    );
    const $body = $el.children('.confluence-information-macro-body').first();
    const $callout = $('<div>')
      .attr('data-type', 'callout')
      .attr('data-callout-type', CALLOUT_BY_MACRO[macro ?? 'information']);
    const heading = $el
      .children('.confluence-information-macro-title, p.title')
      .first()
      .text()
      .trim();
    if (heading) $callout.append($('<p>').append($('<strong>').text(heading)));
    $callout.append($body.length ? $body.contents() : $el.contents());
    $el.replaceWith($callout);
  });

  // code and preformatted blocks
  $('pre').each((_, el) => {
    const $pre = $(el);
    if ($pre.children('code').length) return;
    const params = $pre.attr('data-syntaxhighlighter-params') ?? '';
    const brush = /brush:\s*([\w-]+)/i.exec(params)?.[1]?.toLowerCase();
    const $code = $('<code>').text($pre.text());
    if (brush && brush !== 'none') $code.addClass(`language-${brush}`);
    const $block = $('<pre>').append($code);
    const $panel = $pre.closest('.code.panel, .preformatted.panel');
    ($panel.length ? $panel : $pre).replaceWith($block);
  });

  // expand macro
  $('.expand-container').each((_, el) => {
    const $el = $(el);
    const summary =
      $el.find('.expand-control-text').first().text().trim() || 'Details';
    const $content = $el.children('.expand-content').first();
    const $details = $('<details>');
    $details.append($('<summary>').text(summary));
    $details.append(
      $('<div>')
        .attr('data-type', 'detailsContent')
        .append($content.length ? $content.contents() : $('<p>')),
    );
    $el.replaceWith($details);
  });

  // task lists
  $('ul.inline-task-list').each((_, el) => {
    const $list = $('<ul>').attr('data-type', 'taskList');
    $(el)
      .children('li')
      .each((__, li) => {
        const $li = $(li);
        const checked = $li.hasClass('checked');
        const $item = $('<li>')
          .attr('data-type', 'taskItem')
          .attr('data-checked', String(checked));
        const $input = $('<input>').attr('type', 'checkbox');
        if (checked) $input.attr('checked', '');
        $item.append(
          $('<label>').append($input, $('<span>')),
          $('<div>').append($('<p>').text($li.text().trim())),
        );
        $list.append($item);
      });
    $(el).replaceWith($list);
  });

  // status lozenges
  $('.status-macro, .aui-lozenge').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (!text) {
      $el.remove();
      return;
    }
    const kind = Object.keys(STATUS_COLOR).find((name) =>
      $el.hasClass(`aui-lozenge-${name}`),
    );
    $el.replaceWith(
      $('<span>')
        .attr('data-type', 'status')
        .attr('data-color', STATUS_COLOR[kind ?? ''] ?? 'gray')
        .text(text),
    );
  });

  // emoticons become characters; other interface images go away
  $('img.emoticon').each((_, el) => {
    const name = $(el).attr('data-emoticon-name') ?? '';
    $(el).replaceWith(EMOJI_BY_EMOTICON[name] ?? '');
  });
  $('img[src^="images/"], img[src^="./images/"]').remove();

  // people become plain names
  $('a.confluence-userlink, a.user-mention').each((_, el) => {
    $(el).replaceWith($('<span>').text($(el).text()));
  });

  // tables: drop the wrapper and column widths
  $('.table-wrap').each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  $('colgroup').remove();

  // attachments referenced by images and links
  const attachments = new Map<string, ConfluenceAttachment>();
  const collect = (el: any, attr: 'src' | 'href') => {
    const $el = $(el);
    const raw =
      (attr === 'src' && $el.attr('data-image-src')) || $el.attr(attr);
    if (!raw || !ATTACHMENT_PATH.test(raw)) return;
    const href = raw.split('?')[0].split('#')[0];
    $el.attr(attr, href);
    if (attr === 'src') $el.removeAttr('data-image-src');
    if (!attachments.has(href)) {
      attachments.set(href, {
        href,
        fileName:
          $el.attr('data-linked-resource-default-alias') ??
          decodeHref(href).split('/').pop() ??
          href,
        mimeType: $el.attr('data-linked-resource-content-type') ?? '',
      });
    }
  };
  $('img').each((_, el) => collect(el, 'src'));
  $('a[href]').each((_, el) => collect(el, 'href'));

  // everything left that only exists for layout
  for (let i = 0; i < 6; i++) {
    const $wrappers = $(
      '.conf-macro, .contentLayout2, .columnLayout, .cell, .innerCell, .confluence-embedded-file-wrapper, .content-wrapper, .panelContent',
    );
    if ($wrappers.length === 0) break;
    $wrappers.each((_, el) => {
      $(el).replaceWith($(el).contents());
    });
  }

  const $title = $('<h1>').text(title);
  const content = $('body').html() ?? '';
  return {
    html: `${$.html($title)}${content}`,
    attachments: [...attachments.values()],
  };
}

// Title of an exported page: "Space : Title" in the heading and <title>.
export function pageTitleFromHtml(html: string): string | null {
  const $ = load(html);
  const raw =
    $('#title-text').first().text() || $('title').first().text() || '';
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const parts = text.split(' : ');
  return parts.length > 1 ? parts.slice(1).join(' : ').trim() : text;
}
