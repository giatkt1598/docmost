import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Page } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { CommentRepo } from '@docmost/db/repos/comment/comment.repo';
import { LabelType } from '@docmost/db/repos/label/label.repo';
import { FavoriteType } from '@docmost/db/repos/favorite/favorite.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PageService } from '../page/services/page.service';
import { PageAccessService } from '../page/page-access/page-access.service';
import { CommentService } from '../comment/comment.service';
import { LabelService } from '../label/label.service';
import { FavoriteService } from '../favorite/services/favorite.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { WsService } from '../../ws/ws.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { getPageTitle } from '../../common/helpers';
import { ToolActor } from '../ai-tools/ai-page-tools.service';
import { normalizePageRef } from '../ai-tools/page-ref';
import { ToolDefinition } from '../ai-tools/tool-definition';
import { AttachmentWriter } from '../ai-tools/attachment-writer';
import { attachmentUrl } from '../ai-tools/blocks/doc-blocks';
import {
  RemoteFileError,
  RemoteFileFetcher,
} from '../media-localize/remote-file-fetcher.service';
import { BaseToolsService } from '../ai-tools/bases/base-tools.service';

const PAGE_ID = z
  .string()
  .min(1)
  .max(300)
  .describe('Page id, slug id or page URL');

// Pages, labels, favorites, comments and files for MCP and AI chat. Each
// mirrors the permission checks of the matching REST endpoint.
@Injectable()
export class WorkspaceToolsService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly pageAccess: PageAccessService,
    private readonly commentRepo: CommentRepo,
    private readonly commentService: CommentService,
    private readonly labelService: LabelService,
    private readonly favoriteService: FavoriteService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly wsService: WsService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    private readonly fetcher: RemoteFileFetcher,
    private readonly writer: AttachmentWriter,
    private readonly baseTools: BaseToolsService,
  ) {}

  definitions(actor: ToolActor): ToolDefinition[] {
    return [
      {
        name: 'delete_page',
        description:
          'Move a page and its sub-pages to the trash. It can be brought back with restore_page.',
        inputSchema: z.object({ page_id: PAGE_ID }),
        readOnly: false,
        run: (a) => this.deletePage(actor, a),
      },
      {
        name: 'restore_page',
        description: 'Bring a page back from the trash.',
        inputSchema: z.object({ page_id: PAGE_ID }),
        readOnly: false,
        run: (a) => this.restorePage(actor, a),
      },
      {
        name: 'list_labels',
        description:
          'List the labels of a page, or with no page_id the labels used in the workspace.',
        inputSchema: z.object({
          page_id: PAGE_ID.optional(),
          query: z.string().max(100).optional(),
        }),
        readOnly: true,
        run: (a) => this.listLabels(actor, a),
      },
      {
        name: 'add_page_labels',
        description: 'Add labels to a page by name; missing labels are created.',
        inputSchema: z.object({
          page_id: PAGE_ID,
          names: z.array(z.string().min(1).max(100)).min(1).max(20),
        }),
        readOnly: false,
        run: (a) => this.addLabels(actor, a),
      },
      {
        name: 'remove_page_label',
        description: 'Remove a label from a page, by label name or id.',
        inputSchema: z.object({
          page_id: PAGE_ID,
          label: z.string().min(1).max(100),
        }),
        readOnly: false,
        run: (a) => this.removeLabel(actor, a),
      },
      {
        name: 'add_favorite',
        description: "Add a page to the current user's favorites.",
        inputSchema: z.object({ page_id: PAGE_ID }),
        readOnly: false,
        run: (a) => this.setFavorite(actor, a, true),
      },
      {
        name: 'remove_favorite',
        description: "Remove a page from the current user's favorites.",
        inputSchema: z.object({ page_id: PAGE_ID }),
        readOnly: false,
        run: (a) => this.setFavorite(actor, a, false),
      },
      {
        name: 'set_comment_resolved',
        description: 'Resolve or reopen a top-level comment thread.',
        inputSchema: z.object({
          comment_id: z.string().uuid(),
          resolved: z.boolean(),
        }),
        readOnly: false,
        run: (a) => this.setCommentResolved(actor, a),
      },
      {
        name: 'delete_comment',
        description:
          'Delete a comment. Users may delete their own comments; space admins any.',
        inputSchema: z.object({ comment_id: z.string().uuid() }),
        readOnly: false,
        run: (a) => this.deleteComment(actor, a),
      },
      {
        name: 'upload_file_from_url',
        description:
          'Download a file from a public URL and store it as an attachment of a page. Returns an attachment_id to use in an image, video or file block.',
        inputSchema: z.object({
          page_id: PAGE_ID,
          url: z.string().url().max(2048),
          kind: z
            .enum(['image', 'video', 'file'])
            .optional()
            .describe('What the file must be; default file (any type)'),
        }),
        readOnly: false,
        run: (a) => this.uploadFromUrl(actor, a),
      },
      ...this.baseTools.definitions(actor),
    ];
  }

  async deletePage(actor: ToolActor, args: { page_id: string }) {
    const page = await this.livePage(actor, args.page_id);
    await this.pageAccess.validateCanEdit(page, actor.user);
    await this.pageService.removePage(page.id, actor.user.id, actor.workspace.id);
    this.auditService.log({
      event: AuditEvent.PAGE_TRASHED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: { before: this.pageSummary(page) },
    });
    return { trashed: true, page_id: page.id, title: getPageTitle(page.title) };
  }

  async restorePage(actor: ToolActor, args: { page_id: string }) {
    const page = await this.pageRepo.findById(normalizePageRef(args.page_id));
    if (!page || page.workspaceId !== actor.workspace.id) {
      throw new NotFoundException('Page not found');
    }
    const ability = await this.spaceAbility.createForUser(actor.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    await this.pageAccess.validateCanEdit(page, actor.user);
    await this.pageRepo.restorePage(page.id, actor.workspace.id);
    this.auditService.log({
      event: AuditEvent.PAGE_RESTORED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: { title: getPageTitle(page.title), spaceId: page.spaceId },
      },
    });
    return { restored: true, page_id: page.id, title: getPageTitle(page.title) };
  }

  async listLabels(actor: ToolActor, args: { page_id?: string; query?: string }) {
    const pagination = { limit: 100, query: args.query } as PaginationOptions;
    if (args.page_id) {
      const page = await this.livePage(actor, args.page_id);
      await this.pageAccess.validateCanView(page, actor.user);
      const result = await this.labelService.getPageLabels(page.id, pagination);
      return { labels: result.items.map((l) => ({ id: l.id, name: l.name })) };
    }
    const result = await this.labelService.getLabels(
      actor.workspace.id,
      actor.user.id,
      LabelType.PAGE,
      pagination,
    );
    return { labels: result.items.map((l: any) => ({ id: l.id, name: l.name })) };
  }

  async addLabels(actor: ToolActor, args: { page_id: string; names: string[] }) {
    const page = await this.livePage(actor, args.page_id);
    await this.pageAccess.validateCanEdit(page, actor.user);
    const labels = await this.labelService.addLabelsToPage(
      page.id,
      args.names,
      actor.workspace.id,
    );
    return { labels: labels.map((l) => ({ id: l.id, name: l.name })) };
  }

  async removeLabel(actor: ToolActor, args: { page_id: string; label: string }) {
    const page = await this.livePage(actor, args.page_id);
    await this.pageAccess.validateCanEdit(page, actor.user);
    const { items } = await this.labelService.getPageLabels(page.id, {
      limit: 100,
    } as PaginationOptions);
    const wanted = args.label.trim().toLowerCase();
    const label = items.find(
      (l) => l.id === args.label || l.name.toLowerCase() === wanted,
    );
    if (!label) {
      throw new NotFoundException(
        `The page has no label "${args.label}". Labels: ${
          items.map((l) => `"${l.name}"`).join(', ') || '(none)'
        }`,
      );
    }
    await this.labelService.removeLabelFromPage(page.id, label.id, page.workspaceId);
    return { removed: label.name };
  }

  async setFavorite(actor: ToolActor, args: { page_id: string }, on: boolean) {
    const page = await this.livePage(actor, args.page_id);
    await this.pageAccess.validateCanView(page, actor.user);
    if (on) {
      const { items } = await this.favoriteService.getFavoriteIds(
        actor.user.id,
        actor.workspace.id,
        FavoriteType.PAGE,
      );
      if (!items.includes(page.id)) {
        await this.favoriteService.addFavorite(actor.user.id, actor.workspace.id, {
          type: FavoriteType.PAGE,
          pageId: page.id,
        });
      }
    } else {
      await this.favoriteService.removeFavorite(actor.user.id, {
        type: FavoriteType.PAGE,
        pageId: page.id,
      });
    }
    return { page_id: page.id, favorite: on };
  }

  async setCommentResolved(
    actor: ToolActor,
    args: { comment_id: string; resolved: boolean },
  ) {
    const { comment, page } = await this.commentWithPage(actor, args.comment_id);
    await this.pageAccess.validateCanComment(page, actor.user, actor.workspace.id);
    const wasResolved = comment.resolvedAt != null;
    await this.commentService.setResolved(comment, args.resolved, actor.user);
    if (wasResolved !== args.resolved) {
      this.auditService.log({
        event: args.resolved ? AuditEvent.COMMENT_RESOLVED : AuditEvent.COMMENT_REOPENED,
        resourceType: AuditResource.COMMENT,
        resourceId: comment.id,
        spaceId: comment.spaceId,
        metadata: { pageId: comment.pageId },
      });
    }
    return { comment_id: comment.id, resolved: args.resolved };
  }

  async deleteComment(actor: ToolActor, args: { comment_id: string }) {
    const { comment, page } = await this.commentWithPage(actor, args.comment_id);
    await this.pageAccess.validateCanComment(page, actor.user, actor.workspace.id);
    if (comment.creatorId !== actor.user.id) {
      const ability = await this.spaceAbility.createForUser(actor.user, comment.spaceId);
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        throw new ForbiddenException('You can only delete your own comments');
      }
    }
    await this.commentRepo.deleteComment(comment.id);
    this.wsService.emitCommentEvent(comment.spaceId, comment.pageId, {
      operation: 'commentDeleted',
      pageId: comment.pageId,
      commentId: comment.id,
    });
    this.auditService.log({
      event: AuditEvent.COMMENT_DELETED,
      resourceType: AuditResource.COMMENT,
      resourceId: comment.id,
      spaceId: comment.spaceId,
      metadata: { pageId: comment.pageId },
    });
    return { deleted: true, comment_id: comment.id };
  }

  async uploadFromUrl(
    actor: ToolActor,
    args: { page_id: string; url: string; kind?: 'image' | 'video' | 'file' },
  ) {
    const page = await this.livePage(actor, args.page_id);
    await this.pageAccess.validateCanEdit(page, actor.user);
    let file;
    try {
      file = await this.fetcher.fetch(args.url, args.kind ?? 'file');
    } catch (err) {
      if (err instanceof RemoteFileError) {
        return { error: { code: 'VALIDATION', message: `Download failed: ${err.message}` } };
      }
      throw err;
    }
    const ref = await this.writer.save({
      buffer: file.buffer,
      fileName: file.fileName,
      mimeType: file.mimeType,
      page,
      userId: actor.user.id,
    });
    return {
      attachment_id: ref.id,
      url: attachmentUrl(ref),
      file_name: ref.fileName,
      mime_type: ref.mimeType,
      size: ref.fileSize,
    };
  }

  private async livePage(actor: ToolActor, pageRef: string): Promise<Page> {
    const page = await this.pageRepo.findById(normalizePageRef(pageRef));
    if (!page || page.workspaceId !== actor.workspace.id || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async commentWithPage(actor: ToolActor, commentId: string) {
    const comment = await this.commentRepo.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    const page = await this.pageRepo.findById(comment.pageId);
    if (!page || page.workspaceId !== actor.workspace.id || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return { comment, page };
  }

  private pageSummary(page: Page) {
    return {
      pageId: page.id,
      slugId: page.slugId,
      title: getPageTitle(page.title),
      spaceId: page.spaceId,
    };
  }
}
