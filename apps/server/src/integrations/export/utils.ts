import { jsonToNode } from 'src/collaboration/collaboration.util';
import { Logger } from '@nestjs/common';
import { ExportFormat } from './dto/export-dto';
import { Node } from '@tiptap/pm/model';
import { validate as isValidUUID } from 'uuid';
import * as path from 'path';
import { Page } from '@docmost/db/types/entity.types';
import { isAttachmentNode } from '../../common/helpers/prosemirror/utils';
import { sanitizeFileName } from '../../common/helpers';

export type PageExportTree = Record<string, Page[]>;

export const INTERNAL_LINK_REGEX =
  /^(https?:\/\/)?([^\/]+)?(\/s\/([^\/]+)\/)?p\/([a-zA-Z0-9-]+)\/?$/;

export function getExportExtension(format: string) {
  if (format === ExportFormat.HTML) {
    return '.html';
  }

  if (format === ExportFormat.Markdown) {
    return '.md';
  }
  return;
}

export function getPageTitle(title: string) {
  return title ? title : 'untitled';
}

export function getSafePageTitle(title: string): string {
  const sanitized = sanitizeFileName(getPageTitle(title), {
    preserveSpaces: true,
  });
  return sanitized || 'untitled';
}

export function updateAttachmentUrlsToLocalPaths(prosemirrorJson: any) {
  const doc = jsonToNode(prosemirrorJson);
  if (!doc) return null;

  // Helper function to replace specific URL prefixes
  const replacePrefix = (url: string): string => {
    const prefixes = ['/files', '/api/files'];
    for (const prefix of prefixes) {
      if (url.startsWith(prefix)) {
        return url.replace(prefix, 'files');
      }
    }
    return url;
  };

  doc?.descendants((node: Node) => {
    if (isAttachmentNode(node.type.name)) {
      if (node.attrs.src) {
        // @ts-ignore
        node.attrs.src = replacePrefix(node.attrs.src);
      }
      if (node.attrs.url) {
        // @ts-ignore
        node.attrs.url = replacePrefix(node.attrs.url);
      }
    }
  });

  return doc.toJSON();
}

export function replaceInternalLinks(
  prosemirrorJson: any,
  slugIdToPath: Record<string, string>,
  currentPagePath: string,
  baseUrl?: string,
) {
  const doc = jsonToNode(prosemirrorJson);

  doc.descendants((node: Node) => {
    for (const mark of node.marks) {
      if (mark.type.name === 'link' && mark.attrs.href) {
        const match = mark.attrs.href.match(INTERNAL_LINK_REGEX);
        if (match) {
          const markLink = mark.attrs.href;

          const slugId = extractPageSlugId(match[5]);
          const localPath = slugIdToPath[slugId];

          if (!localPath) {
            if (baseUrl && mark.attrs.href.startsWith('/')) {
              //@ts-expect-error
              mark.attrs.href = `${baseUrl}${mark.attrs.href}`;
            }
            continue;
          }

          const relativePath = computeRelativePath(currentPagePath, localPath);

          //@ts-expect-error
          mark.attrs.href = relativePath;
          //@ts-expect-error
          mark.attrs.target = '_self';
          if (node.isText) {
            // if link and text are same, use page title
            if (markLink === node.text) {
              //@ts-expect-error
              node.text = getInternalLinkPageName(relativePath, currentPagePath);
            }
          }
        }
      }
    }
  });

  return doc.toJSON();
}

export function getInternalLinkPageName(path: string, currentFilePath?: string): string {
  const name = path?.split('/').pop().split('.').slice(0, -1).join('.');
  try {
    return decodeURIComponent(name);
  } catch (err) {
    if (currentFilePath) {
      Logger.warn(
        `URI malformed in page ${currentFilePath}: ${name}. Falling back to raw name.`,
        'ExportUtils',
      );
    }
    return name;
  }
}

export function extractPageSlugId(input: string): string {
  if (!input) {
    return undefined;
  }
  const parts = input.split('-');
  return parts.length > 1 ? parts[parts.length - 1] : input;
}

export function buildTree(pages: Page[]): PageExportTree {
  const tree: PageExportTree = {};
  const titleCount: Record<string, Record<string, number>> = {};

  for (const page of pages) {
    const parentPageId = page.parentPageId;

    if (!titleCount[parentPageId]) {
      titleCount[parentPageId] = {};
    }

    let title = getPageTitle(page.title);

    if (titleCount[parentPageId][title]) {
      title = `${title} (${titleCount[parentPageId][title]})`;
      titleCount[parentPageId][getPageTitle(page.title)] += 1;
    } else {
      titleCount[parentPageId][title] = 1;
    }

    page.title = title;
    if (!tree[parentPageId]) {
      tree[parentPageId] = [];
    }
    tree[parentPageId].push(page);
  }
  return tree;
}

export function computeLocalPath(
  tree: PageExportTree,
  format: string,
  parentPageId: string | null,
  currentPath: string,
  slugIdToPath: Record<string, string>,
) {
  const children = tree[parentPageId] || [];

  for (const page of children) {
    const title = encodeURIComponent(getSafePageTitle(page.title));
    const localPath = `${currentPath}${title}`;
    slugIdToPath[page.slugId] = `${localPath}${getExportExtension(format)}`;

    computeLocalPath(tree, format, page.id, `${localPath}/`, slugIdToPath);
  }
}

// Zip paths always use forward slashes, whatever the server's OS.
export function computeRelativePath(from: string, to: string) {
  return path.posix.relative(path.posix.dirname(from), to);
}

// A base embed as rendered to HTML, optionally already holding its link.
const BASE_EMBED_RE =
  /<div([^>]*\bdata-type="base-embed"[^>]*)>(?:<a [^>]*>[^<]*<\/a>)?<\/div>/g;

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export type BaseEmbedLink = { href: string; title: string };

// Base embeds render as empty divs. Put a link to the base inside, so the
// export is readable elsewhere; the data-page-id lets an import restore it.
export function linkBaseEmbeds(
  html: string,
  resolve: (pageId: string) => BaseEmbedLink | null,
): string {
  return html.replace(BASE_EMBED_RE, (match, attrs: string) => {
    const pageId = /data-page-id="([^"]+)"/.exec(attrs)?.[1];
    if (!pageId) return match;
    const target = resolve(pageId);
    const link = target
      ? `<a href="${escapeHtml(target.href)}">${escapeHtml(target.title)}</a>`
      : '';
    return `<div data-type="base-embed" data-page-id="${escapeHtml(pageId)}">${link}</div>`;
  });
}

// Markdown has no base embed, so the embed HTML is carried through the
// conversion untouched and kept as a raw HTML block.
export function htmlToMarkdownKeepingBaseEmbeds(
  html: string,
  convert: (html: string) => string,
): string {
  const kept: string[] = [];
  const protectedHtml = html.replace(BASE_EMBED_RE, (match) => {
    kept.push(match);
    return `<p>DOCMOSTBASEEMBED${kept.length - 1}END</p>`;
  });
  return convert(protectedHtml).replace(
    /DOCMOSTBASEEMBED(\d+)END/g,
    (_, i: string) => kept[Number(i)] ?? '',
  );
}

// Points base embeds of an imported page at the imported bases.
export function remapBaseEmbeds(
  html: string,
  pageIdMap: Map<string, string>,
): string {
  if (pageIdMap.size === 0) return html;
  return html.replace(BASE_EMBED_RE, (match) =>
    match.replace(
      /data-page-id="([^"]+)"/,
      (attr, id: string) =>
        pageIdMap.has(id) ? `data-page-id="${pageIdMap.get(id)}"` : attr,
    ),
  );
}
