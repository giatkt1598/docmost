import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { AttachmentRef, BlockInput, newBlockId } from './blocks/doc-blocks';
import { PmNode, Span } from './blocks/rich-text';
import { Operation } from './operations/engine';

export type MentionSpan = { mention: { page_id?: string; user_id?: string } };

export type ResolvedReferences = {
  operations: Operation[];
  attachments: Map<string, AttachmentRef>;
  trustedInline: PmNode[];
};

export class ReferenceError extends Error {}

// Before an edit, turns the references the model wrote (mention spans,
// attachment ids) into editor content, checking that the user may see what
// they point at. The engine then only accepts exactly these.
@Injectable()
export class ReferenceResolver {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly userRepo: UserRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly pageAccess: PageAccessService,
  ) {}

  async resolve(
    operations: Operation[],
    actor: { user: User; workspace: Workspace },
  ): Promise<ResolvedReferences> {
    const trustedInline: PmNode[] = [];
    const attachments = new Map<string, AttachmentRef>();
    const mentionCache = new Map<string, PmNode>();

    const mentionNode = async (span: MentionSpan): Promise<PmNode> => {
      const { page_id, user_id } = span.mention ?? {};
      const key = page_id ? `p:${page_id}` : `u:${user_id}`;
      if (mentionCache.has(key)) return { ...mentionCache.get(key) };
      let attrs: Record<string, any>;
      if (page_id && !isUUID(page_id) && !/^[A-Za-z0-9]{6,20}$/.test(page_id)) {
        throw new ReferenceError(
          `Mention page_id must be a page id or slug id, not "${page_id}"`,
        );
      }
      if (user_id && !isUUID(user_id)) {
        throw new ReferenceError(
          `Mention user_id must be a user id (uuid), not "${user_id}"; look people up with list_workspace_members`,
        );
      }
      if (page_id) {
        const page = await this.pageRepo.findById(page_id);
        if (
          !page ||
          page.deletedAt ||
          page.workspaceId !== actor.workspace.id
        ) {
          throw new ReferenceError(`Page ${page_id} does not exist`);
        }
        await this.pageAccess.validateCanView(page, actor.user).catch(() => {
          throw new ReferenceError(`You cannot see page ${page_id}`);
        });
        attrs = {
          label: page.title || 'Untitled',
          entityType: 'page',
          entityId: page.id,
          slugId: page.slugId,
        };
      } else if (user_id) {
        const user = await this.userRepo.findById(user_id, actor.workspace.id);
        if (!user || user.deletedAt) {
          throw new ReferenceError(`User ${user_id} is not in this workspace`);
        }
        attrs = { label: user.name, entityType: 'user', entityId: user.id };
      } else {
        throw new ReferenceError('A mention needs a page_id or a user_id');
      }
      const node: PmNode = {
        type: 'mention',
        attrs: { id: newBlockId(), creatorId: actor.user.id, ...attrs },
      };
      mentionCache.set(key, node);
      return node;
    };

    const spans = async (
      list?: Span[] | any[],
    ): Promise<Span[] | undefined> => {
      if (!list) return list;
      const out: Span[] = [];
      for (const span of list) {
        if (span && typeof span === 'object' && 'mention' in span) {
          const node = await mentionNode(span as MentionSpan);
          trustedInline.push(node);
          out.push({ inline: node, preview: `@${node.attrs.label}` });
        } else {
          out.push(span);
        }
      }
      return out;
    };

    const rows = async (list?: Span[][][]) =>
      list ? Promise.all(list.map((r) => Promise.all(r.map(spans)))) : list;

    const attachment = async (id: string) => {
      if (attachments.has(id)) return;
      const row = await this.attachmentRepo.findById(id);
      if (!row || row.deletedAt || row.workspaceId !== actor.workspace.id) {
        throw new ReferenceError(`File ${id} does not exist`);
      }
      // a file is as visible as the page it belongs to
      const page = row.pageId ? await this.pageRepo.findById(row.pageId) : null;
      if (!page) throw new ReferenceError(`File ${id} is not on a page`);
      await this.pageAccess.validateCanView(page, actor.user).catch(() => {
        throw new ReferenceError(`You cannot see file ${id}`);
      });
      attachments.set(id, {
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        fileSize: row.fileSize ? Number(row.fileSize) : null,
      });
    };

    const block = async (input: BlockInput): Promise<BlockInput> => {
      if (input.attachment_id) await attachment(input.attachment_id);
      const items = input.items
        ? await Promise.all(
            input.items.map(async (item) =>
              typeof item === 'string'
                ? item
                : Array.isArray(item)
                  ? await spans(item)
                  : await block(item),
            ),
          )
        : undefined;
      return {
        ...input,
        ...(input.rich_text && { rich_text: await spans(input.rich_text) }),
        ...(input.rows && { rows: await rows(input.rows) }),
        ...(items && { items }),
        ...(input.children && {
          children: await Promise.all(input.children.map(block)),
        }),
      };
    };

    const resolved: Operation[] = [];
    for (const op of operations) {
      if (op.op === 'insert') {
        resolved.push({
          ...op,
          blocks: await Promise.all(op.blocks.map(block)),
        });
      } else if (op.op === 'update') {
        const patch = { ...op.patch };
        if (patch.rich_text) patch.rich_text = await spans(patch.rich_text);
        if (patch.rows) patch.rows = await rows(patch.rows);
        if (patch.cells) {
          patch.cells = await Promise.all(
            patch.cells.map(async (c) => ({
              ...c,
              ...(c.rich_text && { rich_text: await spans(c.rich_text) }),
            })),
          );
        }
        resolved.push({ ...op, patch });
      } else {
        resolved.push(op);
      }
    }
    return { operations: resolved, attachments, trustedInline };
  }
}
