import { getSchema } from '@tiptap/core';
import { Node, Schema } from '@tiptap/pm/model';
import { markdownToHtml } from '@docmost/editor-ext';
import {
  htmlToJson,
  tiptapExtensions,
} from '../../collaboration/collaboration.util';
import { BlockInput } from './blocks/doc-blocks';
import { PmNode } from './blocks/rich-text';

let schema: Schema | null = null;

export function pageSchema(): Schema {
  if (!schema) schema = getSchema(tiptapExtensions);
  return schema;
}

// Throws when a document does not fit the editor's schema.
export function checkPageSchema(doc: PmNode): void {
  Node.fromJSON(pageSchema(), doc).check();
}

export function toPmNode(doc: PmNode): Node {
  return Node.fromJSON(pageSchema(), doc);
}

// Markdown blocks are expanded before the synchronous apply step.
export async function expandMarkdown(
  blocks: BlockInput[],
  into = new Map<string, PmNode[]>(),
): Promise<Map<string, PmNode[]>> {
  for (const block of blocks) {
    if (block.type === 'markdown' && block.markdown !== undefined) {
      if (!into.has(block.markdown)) {
        const html = await markdownToHtml(block.markdown);
        into.set(block.markdown, htmlToJson(html as string)?.content ?? []);
      }
    }
    if (block.children) await expandMarkdown(block.children, into);
    for (const item of block.items ?? []) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        await expandMarkdown([item], into);
      }
    }
  }
  return into;
}
