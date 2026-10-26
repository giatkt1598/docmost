import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { assignBlockIds, AttachmentRef, blockRev } from './blocks/doc-blocks';
import { PmNode } from './blocks/rich-text';
import {
  applyOperations,
  ApplyResult,
  EditError,
  Operation,
} from './operations/engine';
import { checkPageSchema, toPmNode } from './page-schema';

// y-prosemirror is what the editor uses to keep ProseMirror and Yjs in step;
// it comes with @hocuspocus/transformer. updateYFragment writes a whole
// document into a Yjs fragment as a minimal diff, so blocks nobody touched
// (and what other people are typing in them) stay as they are.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { updateYFragment } = require(
  require.resolve('y-prosemirror', {
    paths: [require.resolve('@hocuspocus/transformer')],
  }),
);

const FRAGMENT = 'default';

export function writeDoc(ydoc: Y.Doc, doc: PmNode): void {
  updateYFragment(ydoc, ydoc.getXmlFragment(FRAGMENT), toPmNode(doc), {
    mapping: new Map(),
    isOMark: new Map(),
  });
}

// The live document with every block carrying an id; ids are written back
// only when some were missing or duplicated.
export function readDocWithIds(ydoc: Y.Doc): PmNode {
  const json = TiptapTransformer.fromYdoc(ydoc, FRAGMENT) as PmNode;
  const { doc, changed } = assignBlockIds(json);
  if (changed) writeDoc(ydoc, doc);
  return doc;
}

export type LiveApplyResult =
  | ({
      ok: true;
      before: PmNode;
      liveRevs: Map<string, string>;
    } & ApplyResult)
  | {
      ok: false;
      code: string;
      message: string;
      details?: EditError['details'];
    };

// Checks and writes in one go. Must run inside a single synchronous Yjs
// transaction so no other update can land between the check and the write.
export function applyToLiveDoc(
  ydoc: Y.Doc,
  operations: Operation[],
  opts: {
    markdown: Map<string, PmNode[]>;
    attachments?: Map<string, AttachmentRef>;
    trustedInline?: PmNode[];
    mode?: 'edit' | 'undo';
  },
): LiveApplyResult {
  const before = readDocWithIds(ydoc);
  try {
    const result = applyOperations(before, operations, {
      markdownToNodes: (md) => opts.markdown.get(md) ?? [],
      attachments: opts.attachments,
      trustedInline: opts.trustedInline,
      checkSchema: checkPageSchema,
      mode: opts.mode,
    });
    writeDoc(ydoc, result.doc);

    // Yjs stores attributes slightly differently from what the engine built
    // (defaults, nulls), and later reads come from Yjs: take the revs the
    // next read will see. Only the newest step of each block meets the live
    // state on Undo; older steps are checked against the engine's own output.
    const after = TiptapTransformer.fromYdoc(ydoc, FRAGMENT) as PmNode;
    const liveRevs = new Map<string, string>();
    const index = (node: PmNode) => {
      for (const child of node.content ?? []) {
        if (child.attrs?.id && child.type !== 'text') {
          liveRevs.set(child.attrs.id, blockRev(child));
        }
        index(child);
      }
    };
    index(after);
    const seen = new Set<string>();
    const inverse = result.inverse.map((op) => {
      if (!('block_id' in op) || !('rev' in op)) return op;
      if (seen.has(op.block_id)) return op;
      seen.add(op.block_id);
      const live = liveRevs.get(op.block_id);
      return live ? { ...op, rev: live } : op;
    });

    return { ok: true, before, ...result, doc: after, inverse, liveRevs };
  } catch (err) {
    if (err instanceof EditError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        details: err.details,
      };
    }
    throw err;
  }
}
