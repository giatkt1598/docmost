import {
  blockChildren,
  blockRev,
  DocBlock,
  docTypeOf,
  nodeText,
  toDocBlock,
} from './doc-blocks';
import { PmNode } from './rich-text';

// Finding one's way around a long page: an outline, slices of blocks and a
// text search that tells where each hit sits. Pure functions.

export type OutlineEntry = {
  id: string;
  rev: string;
  level: number;
  text: string;
};

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();

// DocBlock children of the page or of a block
function childrenOf(doc: PmNode, parentId: string | null): PmNode[] | null {
  if (!parentId) {
    return (doc.content ?? []).filter((n) => n.type !== 'footnotes');
  }
  const found = findWithAncestors(doc, parentId);
  return found ? blockChildren(found.node) : null;
}

export function findWithAncestors(
  doc: PmNode,
  id: string,
): { node: PmNode; ancestors: PmNode[] } | null {
  const walk = (node: PmNode, ancestors: PmNode[]) => {
    for (const child of node.content ?? []) {
      if (child.attrs?.id === id && child.type !== 'text') {
        return { node: child, ancestors };
      }
      const hit = walk(
        child,
        child.attrs?.id ? [...ancestors, child] : ancestors,
      );
      if (hit) return hit;
    }
    return null;
  };
  return walk(doc, []);
}

export function outline(doc: PmNode): {
  headings: OutlineEntry[];
  top_level_blocks: number;
} {
  const headings: OutlineEntry[] = [];
  const walk = (node: PmNode) => {
    for (const child of node.content ?? []) {
      if (child.type === 'heading' && child.attrs?.id) {
        headings.push({
          id: child.attrs.id,
          rev: blockRev(child),
          level: child.attrs.level ?? 1,
          text: nodeText(child).slice(0, 200),
        });
      }
      walk(child);
    }
  };
  walk(doc);
  return {
    headings,
    top_level_blocks: childrenOf(doc, null)?.length ?? 0,
  };
}

export function sliceBlocks(
  doc: PmNode,
  opts: {
    parent_id?: string | null;
    start?: number;
    limit?: number;
    depth?: number;
  },
): { blocks: DocBlock[]; total: number; next_start: number | null } | null {
  const children = childrenOf(doc, opts.parent_id ?? null);
  if (!children) return null;
  const start = Math.max(0, opts.start ?? 0);
  const limit = Math.min(Math.max(1, opts.limit ?? 30), 100);
  const slice = children.slice(start, start + limit);
  return {
    blocks: slice.map((n) => toDocBlock(n, opts.depth ?? 1)),
    total: children.length,
    next_start: start + limit < children.length ? start + limit : null,
  };
}

export type BlockHit = {
  block: DocBlock;
  // ancestors from the page down, and the heading the block sits under
  path: { id: string; type: string; text?: string }[];
  under_heading: { id: string; text: string } | null;
  previous_id: string | null;
  next_id: string | null;
};

export function findBlocks(doc: PmNode, query: string, limit = 10): BlockHit[] {
  const needle = unaccent(query.trim());
  if (!needle) return [];
  const hits: BlockHit[] = [];

  // the last heading seen before each top-level position
  const walk = (
    node: PmNode,
    ancestors: PmNode[],
    heading: { id: string; text: string } | null,
  ) => {
    const children = node === doc ? childrenOf(doc, null) : blockChildren(node);
    let currentHeading = heading;
    children.forEach((child, i) => {
      if (hits.length >= limit) return;
      if (child.type === 'heading' && child.attrs?.id) {
        currentHeading = {
          id: child.attrs.id,
          text: nodeText(child).slice(0, 120),
        };
      }
      const own =
        docTypeOf(child) === 'list_item' || docTypeOf(child) === 'todo_item'
          ? nodeText(child.content?.[0] ?? { type: 'paragraph' })
          : blockChildren(child).length
            ? ''
            : nodeText(child);
      if (child.attrs?.id && own && unaccent(own).includes(needle)) {
        hits.push({
          block: toDocBlock(child, 0),
          path: ancestors.map((a) => ({
            id: a.attrs?.id,
            type: docTypeOf(a),
          })),
          under_heading:
            currentHeading && currentHeading.id !== child.attrs.id
              ? currentHeading
              : null,
          previous_id: children[i - 1]?.attrs?.id ?? null,
          next_id: children[i + 1]?.attrs?.id ?? null,
        });
      }
      if (blockChildren(child).length) {
        walk(child, [...ancestors, child], currentHeading);
      }
    });
  };
  walk(doc, [], null);
  return hits;
}
