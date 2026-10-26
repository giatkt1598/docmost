import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { v7 } from 'uuid';
import { generateSlugId } from '../../../common/helpers';
import { ImportPageNode } from '../dto/file-task-dto';
import {
  buildAttachmentCandidates,
  collectMarkdownAndHtmlFiles,
} from '../utils/import.utils';
import {
  ConfluenceTreeNode,
  convertConfluenceHtml,
  decodeHref,
  pageTitleFromHtml,
  parentFromBreadcrumbs,
  parseIndexTree,
} from '../utils/confluence-html';
import { PageAttachmentInfo } from './import-attachment.service';

const SKIPPED_FOLDERS = new Set(['attachments', 'images', 'styles']);
const MAX_DEPTH = 100;

export type PreparedConfluenceImport = {
  pagesMap: Map<string, ImportPageNode>;
  attachmentCandidates: Map<string, string>;
  // position of each page among its siblings, as in Confluence
  order: Map<string, number>;
  transform: (
    html: string,
    page: ImportPageNode,
  ) => { html: string; attachments: PageAttachmentInfo[] };
};

const key = (relPath: string) => relPath.normalize('NFC').toLowerCase();

// Reads an extracted Confluence HTML export (Cloud or Server/Data Center)
// into the page tree the importer persists. The page files sit flat in the
// archive; the tree and the order come from index.html, with the breadcrumbs
// of each page as a fallback.
@Injectable()
export class ConfluenceImportService {
  private readonly logger = new Logger(ConfluenceImportService.name);

  async prepare(extractDir: string): Promise<PreparedConfluenceImport> {
    const files = (await collectMarkdownAndHtmlFiles(extractDir))
      .map((abs) => path.relative(extractDir, abs).split(path.sep).join('/'))
      .filter(
        (rel) =>
          rel.toLowerCase().endsWith('.html') &&
          !SKIPPED_FOLDERS.has(rel.split('/')[0].toLowerCase()),
      );

    const byKey = new Map(files.map((rel) => [key(rel), rel]));
    const indexRel = byKey.get('index.html');
    const pageFiles = files.filter((rel) => key(rel) !== 'index.html');

    const pagesMap = new Map<string, ImportPageNode>();
    const order = new Map<string, number>();
    const newNode = (rel: string, name: string, parent: string | null) => {
      const node: ImportPageNode = {
        id: v7(),
        slugId: generateSlugId(),
        name,
        content: '',
        parentPageId: parent,
        fileExtension: '.html',
        filePath: rel,
        icon: null,
      };
      pagesMap.set(rel, node);
      order.set(rel, order.size);
      return node;
    };

    const addTree = (
      nodes: ConfluenceTreeNode[],
      parent: string | null,
      depth: number,
    ) => {
      for (const node of nodes) {
        const rel = byKey.get(key(node.href));
        if (!rel || pagesMap.has(rel) || depth > MAX_DEPTH) continue;
        const page = newNode(
          rel,
          node.title || path.basename(rel, '.html'),
          parent,
        );
        addTree(node.children, page.id, depth + 1);
      }
    };

    if (indexRel) {
      const index = await fs.readFile(path.join(extractDir, indexRel), 'utf-8');
      addTree(parseIndexTree(index), null, 0);
    }

    // pages the index does not list hang below their breadcrumb parent
    const pending = pageFiles.filter((rel) => !pagesMap.has(rel));
    const pendingSet = new Set(pending);
    const parentOf = new Map<string, string | null>();
    const titleOf = new Map<string, string>();
    for (const rel of pending) {
      const html = await fs.readFile(path.join(extractDir, rel), 'utf-8');
      titleOf.set(rel, pageTitleFromHtml(html) ?? path.basename(rel, '.html'));
      const parentHref = parentFromBreadcrumbs(html, path.basename(rel));
      parentOf.set(
        rel,
        parentHref ? (byKey.get(key(decodeHref(parentHref))) ?? null) : null,
      );
    }

    // parents first: a page is added once its parent exists
    let remaining = [...pending];
    for (let pass = 0; pass < MAX_DEPTH && remaining.length > 0; pass++) {
      const next: string[] = [];
      for (const rel of remaining) {
        const parentRel = parentOf.get(rel) ?? null;
        if (
          parentRel &&
          pendingSet.has(parentRel) &&
          !pagesMap.has(parentRel)
        ) {
          next.push(rel);
          continue;
        }
        newNode(
          rel,
          titleOf.get(rel),
          parentRel ? (pagesMap.get(parentRel)?.id ?? null) : null,
        );
      }
      if (next.length === remaining.length) {
        // a loop of parents: attach what is left at the top
        for (const rel of next) newNode(rel, titleOf.get(rel), null);
        break;
      }
      remaining = next;
    }

    if (pagesMap.size === 0) {
      throw new Error(
        'No pages found. Export the space from Confluence as HTML and upload the zip file.',
      );
    }
    this.logger.log(`Confluence export: ${pagesMap.size} pages`);

    return {
      pagesMap,
      order,
      attachmentCandidates: await buildAttachmentCandidates(extractDir),
      transform: (html, page) => convertConfluenceHtml(html, page.name),
    };
  }
}
