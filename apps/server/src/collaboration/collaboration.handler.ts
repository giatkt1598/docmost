import { Injectable, Logger } from '@nestjs/common';
import { Hocuspocus, Document } from '@hocuspocus/server';
import { TiptapTransformer } from '@hocuspocus/transformer';
import {
  prosemirrorNodeToYElement,
  tiptapExtensions,
} from './collaboration.util';
import { setYjsMark, updateYjsMarkAttribute, YjsSelection } from './yjs.util';
import * as Y from 'yjs';
import { User } from '@docmost/db/types/entity.types';
import { applyToLiveDoc, readDocWithIds } from '../core/ai-tools/live-doc';
import { PmNode } from '../core/ai-tools/blocks/rich-text';
import { AttachmentRef } from '../core/ai-tools/blocks/doc-blocks';
import { Operation } from '../core/ai-tools/operations/engine';

export type MediaReplacement = {
  url: string;
  src: string;
  attachmentId: string;
  size: number;
  fileName: string;
  mimeType: string;
};

// media node -> attribute holding its file URL
const MEDIA_URL_ATTR: Record<string, string> = {
  image: 'src',
  video: 'src',
  audio: 'src',
  pdf: 'src',
  attachment: 'url',
};

export type CollabEventHandlers = ReturnType<
  CollaborationHandler['getHandlers']
>;

@Injectable()
export class CollaborationHandler {
  private readonly logger = new Logger(CollaborationHandler.name);

  constructor() {}

  getHandlers(hocuspocus: Hocuspocus) {
    return {
      getConnectedUserIds: async (documentName: string) => {
        const document = hocuspocus.documents.get(documentName);
        if (!document) return [];

        const userIds = new Set<string>();
        for (const state of document.awareness.getStates().values()) {
          const userId = state?.user?.id;
          if (typeof userId === 'string') userIds.add(userId);
        }
        return [...userIds];
      },
      alterState: async (documentName: string, payload: { pageId: string }) => {
        // dummy
        // this.logger.log('Processing', documentName, payload);
        // await this.withYdocConnection(hocuspocus, documentName, {}, (doc) => {
        //   const fragment = doc.getXmlFragment('default');
        //});
      },
      setCommentMark: async (
        documentName: string,
        payload: {
          yjsSelection: YjsSelection;
          commentId: string;
          resolved: boolean;
          user: User;
        },
      ) => {
        const { yjsSelection, commentId, resolved, user } = payload;
        await this.withYdocConnection(
          hocuspocus,
          documentName,
          { user },
          (doc) => {
            const fragment = doc.getXmlFragment('default');
            setYjsMark(doc, fragment, yjsSelection, 'comment', {
              commentId,
              resolved,
            });
          },
        );
      },
      resolveCommentMark: async (
        documentName: string,
        payload: {
          commentId: string;
          resolved: boolean;
          user: User;
        },
      ) => {
        const { commentId, resolved, user } = payload;
        await this.withYdocConnection(
          hocuspocus,
          documentName,
          { user },
          (doc) => {
            const fragment = doc.getXmlFragment('default');
            updateYjsMarkAttribute(
              fragment,
              'comment',
              { name: 'commentId', value: commentId },
              { resolved },
            );
          },
        );
      },
      updatePageContent: async (
        documentName: string,
        payload: {
          prosemirrorJson: any;
          operation: string;
          user: User;
        },
      ) => {
        const { prosemirrorJson, operation, user } = payload;
        this.logger.debug('Updating page content via yjs', documentName);
        await this.withYdocConnection(
          hocuspocus,
          documentName,
          { user },
          (doc) => {
            const fragment = doc.getXmlFragment('default');

            if (operation === 'replace') {
              if (fragment.length > 0) {
                fragment.delete(0, fragment.length);
              }

              const newDoc = TiptapTransformer.toYdoc(
                prosemirrorJson,
                'default',
                tiptapExtensions,
              );
              Y.applyUpdate(doc, Y.encodeStateAsUpdate(newDoc));
            } else {
              const newContent = prosemirrorJson.content || [];
              const yElements = newContent.map(prosemirrorNodeToYElement);
              const position = operation === 'prepend' ? 0 : fragment.length;
              fragment.insert(position, yElements);
            }
          },
        );
      },
      // AI page tools: the live document with ids on every block.
      // Results are plain objects (never thrown) so they survive the Redis
      // round trip when another instance owns the document.
      aiReadPage: async (documentName: string, payload: { user: User }) => {
        let doc: PmNode = null;
        try {
          await this.withYdocConnection(
            hocuspocus,
            documentName,
            { user: payload.user },
            (ydoc) => {
              doc = readDocWithIds(ydoc);
            },
          );
          return { ok: true as const, doc };
        } catch (err) {
          this.logger.error(`AI read of ${documentName} failed`, err);
          return {
            ok: false as const,
            code: 'INTERNAL',
            message: (err as Error).message,
          };
        }
      },
      // Checks and writes block operations in one Yjs transaction.
      aiApplyOperations: async (
        documentName: string,
        payload: {
          user: User;
          operations: Operation[];
          markdown: [string, PmNode[]][];
          attachments?: [string, AttachmentRef][];
          trustedInline?: PmNode[];
          mode?: 'edit' | 'undo';
        },
      ) => {
        let result: any = null;
        try {
          await this.withYdocConnection(
            hocuspocus,
            documentName,
            { user: payload.user },
            (ydoc) => {
              result = applyToLiveDoc(ydoc, payload.operations, {
                markdown: new Map(payload.markdown ?? []),
                attachments: new Map(payload.attachments ?? []),
                trustedInline: payload.trustedInline ?? [],
                mode: payload.mode,
              });
            },
          );
          if (result?.ok) {
            result = {
              ...result,
              liveRevs: Object.fromEntries(result.liveRevs),
            };
          }
          return result as
            | {
                ok: true;
                before: PmNode;
                doc: PmNode;
                inverse: Operation[];
                changedIds: string[];
                deletedIds: string[];
                liveRevs: Record<string, string>;
              }
            | {
                ok: false;
                code: string;
                message: string;
                details?: any[];
              };
        } catch (err) {
          this.logger.error(`AI edit of ${documentName} failed`, err);
          return {
            ok: false as const,
            code: 'INTERNAL',
            message: (err as Error).message,
          };
        }
      },
      // Points media nodes still using an external URL at our own copy.
      // Returns how many nodes each URL replaced.
      localizeMedia: async (
        documentName: string,
        payload: {
          replacements: MediaReplacement[];
          user?: User;
        },
      ) => {
        const byUrl = new Map(payload.replacements.map((r) => [r.url, r]));
        const counts: Record<string, number> = {};
        await this.withYdocConnection(
          hocuspocus,
          documentName,
          { user: payload.user },
          (doc) => {
            const walk = (parent: Y.XmlFragment | Y.XmlElement) => {
              parent.toArray().forEach((child) => {
                if (!(child instanceof Y.XmlElement)) return;
                const attr = MEDIA_URL_ATTR[child.nodeName];
                const current = attr ? child.getAttribute(attr) : undefined;
                const target =
                  typeof current === 'string' ? byUrl.get(current) : undefined;
                if (target && !child.getAttribute('attachmentId')) {
                  child.setAttribute(attr, target.src);
                  child.setAttribute('attachmentId', target.attachmentId);
                  child.setAttribute('size', target.size as any);
                  if (child.nodeName === 'attachment') {
                    if (!child.getAttribute('name')) {
                      child.setAttribute('name', target.fileName);
                    }
                    if (!child.getAttribute('mime')) {
                      child.setAttribute('mime', target.mimeType);
                    }
                  }
                  if (child.nodeName === 'pdf' && !child.getAttribute('name')) {
                    child.setAttribute('name', target.fileName);
                  }
                  counts[target.url] = (counts[target.url] ?? 0) + 1;
                }
                walk(child);
              });
            };
            walk(doc.getXmlFragment('default'));
          },
        );
        return counts;
      },
    };
  }

  async withYdocConnection(
    hocuspocus: Hocuspocus,
    documentName: string,
    context: any = {},
    fn: (doc: Document) => void,
  ): Promise<void> {
    const connection = await hocuspocus.openDirectConnection(
      documentName,
      context,
    );
    try {
      await connection.transact(fn);
    } finally {
      await connection.disconnect();
    }
  }
}
