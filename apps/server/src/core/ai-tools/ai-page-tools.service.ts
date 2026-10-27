import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { PageService } from '../page/services/page.service';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { StorageService } from '../../integrations/storage/storage.service';
import { DiagramPreparer } from './diagrams/diagram-preparer';
import { xmlFromDrawioSvg } from './diagrams/drawio-xml';
import { findWithAncestors } from './blocks/navigation';
import { nodeText } from './blocks/doc-blocks';
import { normalizePageRef } from './page-ref';
import { assignBlockIds } from './blocks/doc-blocks';
import { AiPageEditService, ApplyOutcome } from './ai-page-edit.service';
import { findBlocks, outline, sliceBlocks } from './blocks/navigation';
import { Operation } from './operations/engine';
import { pageToolSchemas } from './tool-schemas';
import { ReferenceError, ReferenceResolver } from './reference-resolver';
import { InputShapeError, normalizeOperations } from './operations/normalize';

export type ToolActor = { user: User; workspace: Workspace };
type Args<K extends keyof typeof pageToolSchemas> = z.infer<
  (typeof pageToolSchemas)[K]
>;

// The AI page tools, behind the same permission checks as the REST API.
// Edit problems (conflicts, invalid blocks, limits) come back as an `error`
// object the model can act on rather than as exceptions.
@Injectable()
export class AiPageToolsService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly pageAccess: PageAccessService,
    private readonly edits: AiPageEditService,
    private readonly references: ReferenceResolver,
    private readonly pageHistoryRepo: PageHistoryRepo,
    private readonly diagrams: DiagramPreparer,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly storage: StorageService,
  ) {}

  private async findPage(actor: ToolActor, pageId: string): Promise<Page> {
    const page = await this.pageRepo.findById(normalizePageRef(pageId), {
      includeSpace: true,
    });
    if (!page || page.deletedAt || page.workspaceId !== actor.workspace.id) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async readable(actor: ToolActor, pageId: string) {
    const page = await this.findPage(actor, pageId);
    const { canEdit } = await this.pageAccess.validateCanViewWithPermissions(
      page,
      actor.user,
    );
    return { page, canEdit };
  }

  private async editable(actor: ToolActor, pageId: string) {
    const page = await this.findPage(actor, pageId);
    await this.pageAccess.validateCanEdit(page, actor.user);
    return page;
  }

  async getPageOutline(actor: ToolActor, args: Args<'get_page_outline'>) {
    const { page, canEdit } = await this.readable(actor, args.page_id);
    const doc = await this.edits.readPage(page.id, actor.user);
    const crumbs = await this.pageService.getPageBreadCrumbs(page.id);
    const space = (page as any).space;
    return {
      page: {
        id: page.id,
        title: page.title || 'Untitled',
        url: space?.slug ? `/s/${space.slug}/p/${page.slugId}` : undefined,
        space: space ? { id: space.id, name: space.name } : undefined,
        path: crumbs
          .filter((c: any) => c.id !== page.id)
          .map((c: any) => c.title || 'Untitled'),
        can_edit: canEdit,
      },
      ...outline(doc),
    };
  }

  async getBlocks(actor: ToolActor, args: Args<'get_blocks'>) {
    const { page } = await this.readable(actor, args.page_id);
    const doc = await this.edits.readPage(page.id, actor.user);
    const slice = sliceBlocks(doc, args);
    if (!slice) {
      return {
        error: {
          code: 'NOT_FOUND',
          message: `Block ${args.parent_id} does not exist (any more)`,
        },
      };
    }
    return slice;
  }

  async findBlocks(actor: ToolActor, args: Args<'find_blocks'>) {
    const { page } = await this.readable(actor, args.page_id);
    const doc = await this.edits.readPage(page.id, actor.user);
    const hits = findBlocks(doc, args.query, args.limit ?? 10);
    return { hits, count: hits.length };
  }

  private result(outcome: ApplyOutcome) {
    return outcome.ok === false
      ? { error: outcome.error }
      : {
          edit_id: outcome.edit_id,
          changed: outcome.changed,
          deleted_ids: outcome.deleted_ids,
        };
  }

  async applyOperations(
    actor: ToolActor,
    args: { page_id: string; summary: string; operations: Operation[] },
    ctx: { aiChatId?: string } = {},
  ) {
    const page = await this.editable(actor, args.page_id);
    let resolved;
    try {
      const operations = await this.diagrams.prepare(
        normalizeOperations(args.operations),
        page,
        actor.user,
      );
      resolved = await this.references.resolve(operations, actor);
    } catch (err) {
      if (err instanceof InputShapeError) {
        return {
          error: {
            code: 'VALIDATION',
            message: `${err.path}: ${err.message}`,
          },
        };
      }
      if (err instanceof ReferenceError) {
        return { error: { code: 'VALIDATION', message: err.message } };
      }
      throw err;
    }
    const outcome = await this.edits.apply(page, actor.user, {
      summary: args.summary,
      operations: resolved.operations,
      attachments: resolved.attachments,
      trustedInline: resolved.trustedInline,
      aiChatId: ctx.aiChatId,
    });
    return this.result(outcome);
  }

  insertBlocks(
    actor: ToolActor,
    args: Args<'insert_blocks'>,
    ctx?: { aiChatId?: string },
  ) {
    return this.applyOperations(
      actor,
      {
        page_id: args.page_id,
        summary: args.summary,
        operations: [
          {
            op: 'insert',
            parent_id: args.parent_id,
            after_id: args.after_id,
            blocks: args.blocks,
          },
        ],
      },
      ctx,
    );
  }

  updateBlock(
    actor: ToolActor,
    args: Args<'update_block'>,
    ctx?: { aiChatId?: string },
  ) {
    return this.applyOperations(
      actor,
      {
        page_id: args.page_id,
        summary: args.summary,
        operations: [
          {
            op: 'update',
            block_id: args.block_id,
            rev: args.rev,
            patch: args.patch as any,
          },
        ],
      },
      ctx,
    );
  }

  moveBlock(
    actor: ToolActor,
    args: Args<'move_block'>,
    ctx?: { aiChatId?: string },
  ) {
    return this.applyOperations(
      actor,
      {
        page_id: args.page_id,
        summary: args.summary,
        operations: [
          {
            op: 'move',
            block_id: args.block_id,
            rev: args.rev,
            parent_id: args.parent_id,
            after_id: args.after_id,
          },
        ],
      },
      ctx,
    );
  }

  deleteBlocks(
    actor: ToolActor,
    args: Args<'delete_blocks'>,
    ctx?: { aiChatId?: string },
  ) {
    return this.applyOperations(
      actor,
      {
        page_id: args.page_id,
        summary: args.summary,
        operations: args.blocks.map((b) => ({
          op: 'delete' as const,
          block_id: b.block_id,
          rev: b.rev,
        })),
      },
      ctx,
    );
  }

  // The source of a diagram block: Mermaid text or draw.io XML.
  async getDiagram(actor: ToolActor, args: Args<'get_diagram'>) {
    const { page } = await this.readable(actor, args.page_id);
    const doc = await this.edits.readPage(page.id, actor.user);
    const found = findWithAncestors(doc, args.block_id);
    if (!found) {
      return { error: { code: 'NOT_FOUND', message: `Block ${args.block_id} not found` } };
    }
    const node = found.node;
    if (node.type === 'codeBlock' && node.attrs?.language === 'mermaid') {
      return { format: 'mermaid', source: nodeText(node) };
    }
    if (node.type === 'drawio') {
      const attachment = node.attrs?.attachmentId
        ? await this.attachmentRepo.findById(node.attrs.attachmentId)
        : null;
      if (!attachment || attachment.workspaceId !== actor.workspace.id) {
        return { error: { code: 'NOT_FOUND', message: 'The diagram file is missing' } };
      }
      const svg = (await this.storage.read(attachment.filePath)).toString('utf8');
      return {
        format: 'drawio',
        title: node.attrs?.title ?? null,
        xml: xmlFromDrawioSvg(svg),
      };
    }
    return {
      error: {
        code: 'VALIDATION',
        message: `Block ${args.block_id} is a ${node.type}, not a Mermaid or draw.io diagram`,
      },
    };
  }

  async listPageHistory(actor: ToolActor, args: Args<'list_page_history'>) {
    const { page } = await this.readable(actor, args.page_id);
    const result = await this.pageHistoryRepo.findPageHistoryByPageId(page.id, {
      limit: args.limit ?? 20,
    } as any);
    return {
      versions: result.items.map((v: any) => ({
        history_id: v.id,
        created_at: v.createdAt,
        title: v.title,
        source: v.source ?? 'user',
        summary: v.aiEdit?.summary ?? null,
        author: v.lastUpdatedBy?.name ?? null,
      })),
    };
  }

  // Puts an earlier version back as one AI edit, so it can be undone too.
  async restorePageVersion(
    actor: ToolActor,
    args: Args<'restore_page_version'>,
    ctx: { aiChatId?: string } = {},
  ) {
    const page = await this.editable(actor, args.page_id);
    const version = await this.pageHistoryRepo.findById(args.history_id, {
      includeContent: true,
    });
    if (!version || version.pageId !== page.id || !version.content) {
      throw new NotFoundException('Version not found for this page');
    }
    const outcome = await this.edits.apply(page, actor.user, {
      summary: args.summary,
      operations: [
        {
          op: 'replace_document',
          node: assignBlockIds(version.content as any).doc,
        },
      ],
      aiChatId: ctx.aiChatId,
    });
    return outcome.ok === false
      ? { error: outcome.error }
      : { edit_id: outcome.edit_id, restored: args.history_id };
  }

  async undoAiEdit(actor: ToolActor, args: Args<'undo_ai_edit'>) {
    const pageId = await this.edits.pageOfEdit(
      args.edit_id,
      actor.workspace.id,
    );
    if (!pageId) throw new NotFoundException('Edit not found');
    await this.editable(actor, pageId);
    const outcome = await this.edits.undo(
      args.edit_id,
      actor.user,
      actor.workspace.id,
    );
    return this.result(outcome);
  }
}
