import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CallToolResult,
  createMcpHandler,
  McpHttpHandler,
  McpServer,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PageService } from '../page/services/page.service';
import { PageAccessService } from '../page/page-access/page-access.service';
import { HybridSearchService } from '../search/hybrid-search.service';
import { SpaceMemberService } from '../space/services/space-member.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { SpaceService } from '../space/services/space.service';
import { CommentService } from '../comment/comment.service';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';
import { CommentRepo } from '@docmost/db/repos/comment/comment.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { markdownToHtml } from '@docmost/editor-ext';
import {
  htmlToJson,
  jsonToMarkdown,
} from '../../collaboration/collaboration.util';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { getPageTitle } from '../../common/helpers';
import { AiPageToolsService } from '../ai-tools/ai-page-tools.service';
import { toolError } from '../ai-tools/tool-error';
import {
  BLOCK_GUIDE,
  PAGE_TOOL_DESCRIPTIONS,
  pageToolSchemas,
} from '../ai-tools/tool-schemas';
import { SEARCH_QUERY_MAX_LENGTH } from '../search/dto/search.dto';
import { UpdateSpaceDto } from '../space/dto/update-space.dto';
import { CreateCommentDto } from '../comment/dto/create-comment.dto';

export type McpActor = { user: User; workspace: Workspace };

const MAX_LIST_LIMIT = 100;

// Each tool mirrors the permission checks of the matching REST endpoint.
@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly pageAccessService: PageAccessService,
    private readonly searchService: HybridSearchService,
    private readonly spaceMemberService: SpaceMemberService,
    private readonly spaceAbility: SpaceAbilityFactory,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly spaceService: SpaceService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly commentService: CommentService,
    private readonly commentRepo: CommentRepo,
    private readonly userRepo: UserRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageTools: AiPageToolsService,
  ) {}

  // Stateless: a fresh server per request, bound to the authenticated actor.
  createHandler(actor: McpActor): McpHttpHandler {
    return createMcpHandler(() => this.createServer(actor), {
      onerror: (err) => this.logger.warn(`MCP error: ${err.message}`),
    });
  }

  createServer(actor: McpActor): McpServer {
    const server = new McpServer({
      name: 'docmost',
      version: process.env.npm_package_version ?? 'dev',
    });

    server.registerTool(
      'list_spaces',
      {
        title: 'List spaces',
        description: 'List the Docmost spaces the current user is a member of.',
        inputSchema: z.object({
          query: z.string().optional().describe('Filter by space name'),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
          cursor: z.string().optional().describe('Cursor from a previous call'),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.listSpaces(actor, args)),
    );

    server.registerTool(
      'search_pages',
      {
        title: 'Search pages',
        description:
          'Full-text search across pages the current user can read. Optionally limit to one space.',
        inputSchema: z.object({
          query: z.string().min(1).max(SEARCH_QUERY_MAX_LENGTH),
          spaceId: z.uuid().optional(),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.searchPages(actor, args)),
    );

    server.registerTool(
      'get_page',
      {
        title: 'Get page',
        description: 'Get a page with its content as Markdown.',
        inputSchema: z.object({
          pageId: z.string().min(1).describe('Page id or slug id'),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.getPage(actor, args)),
    );

    server.registerTool(
      'list_child_pages',
      {
        title: 'List child pages',
        description:
          'List the root pages of a space, or the direct children of a page.',
        inputSchema: z.object({
          spaceId: z.uuid().optional(),
          pageId: z.string().optional().describe('Parent page id'),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
          cursor: z.string().optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.listChildPages(actor, args)),
    );

    server.registerTool(
      'create_page',
      {
        title: 'Create page',
        description:
          'Create a page in a space, optionally under a parent page. Content is Markdown.',
        inputSchema: z.object({
          spaceId: z.uuid(),
          title: z.string().optional(),
          content: z.string().optional().describe('Markdown content'),
          parentPageId: z.string().optional(),
        }),
      },
      (args) => this.run(() => this.createPage(actor, args)),
    );

    server.registerTool(
      'update_page',
      {
        title: 'Update page',
        description:
          'Update a page title and/or content. Content is Markdown and is appended, prepended, or replaces the existing content.',
        inputSchema: z.object({
          pageId: z.string().min(1),
          title: z.string().optional(),
          content: z.string().optional().describe('Markdown content'),
          operation: z
            .enum(['append', 'prepend', 'replace'])
            .optional()
            .describe('Required when content is given'),
        }),
        annotations: { destructiveHint: true },
      },
      (args) => this.run(() => this.updatePage(actor, args)),
    );

    server.registerTool(
      'list_pages',
      {
        title: 'List pages',
        description: 'List recently updated pages in a space.',
        inputSchema: z.object({
          spaceId: z.uuid(),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
          cursor: z.string().optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.listPages(actor, args)),
    );

    server.registerTool(
      'duplicate_page',
      {
        title: 'Duplicate page',
        description:
          'Duplicate a page and its accessible child pages within its space.',
        inputSchema: z.object({ pageId: z.string().min(1) }),
      },
      (args) => this.run(() => this.duplicatePage(actor, args)),
    );

    server.registerTool(
      'copy_page_to_space',
      {
        title: 'Copy page to space',
        description:
          'Copy a page and its accessible child pages to another space.',
        inputSchema: z.object({
          pageId: z.string().min(1),
          spaceId: z.uuid().describe('Target space id'),
        }),
      },
      (args) => this.run(() => this.duplicatePage(actor, args)),
    );

    server.registerTool(
      'move_page',
      {
        title: 'Move page',
        description:
          'Move a page under another parent page in the same space. Pass parentPageId null to move it to the root of the space; omit it to keep the current parent. The page is placed last among its siblings.',
        inputSchema: z.object({
          pageId: z.string().min(1),
          parentPageId: z.string().nullable().optional(),
        }),
        annotations: { destructiveHint: true },
      },
      (args) => this.run(() => this.movePage(actor, args)),
    );

    server.registerTool(
      'move_page_to_space',
      {
        title: 'Move page to space',
        description:
          'Move a page and its accessible child pages to another space.',
        inputSchema: z.object({
          pageId: z.string().min(1),
          spaceId: z.uuid().describe('Target space id'),
        }),
        annotations: { destructiveHint: true },
      },
      (args) => this.run(() => this.movePageToSpace(actor, args)),
    );

    server.registerTool(
      'get_space',
      {
        title: 'Get space',
        description: "Get a space's details and the current user's role in it.",
        inputSchema: z.object({ spaceId: z.uuid() }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.getSpace(actor, args)),
    );

    server.registerTool(
      'create_space',
      {
        title: 'Create space',
        description: 'Create a new space. Requires workspace admin rights.',
        inputSchema: z.object({
          name: z.string().trim().min(2).max(100),
          slug: z
            .string()
            .min(2)
            .max(100)
            .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
            .describe('Letters, numbers, hyphens and underscores'),
          description: z.string().optional(),
        }),
      },
      (args) => this.run(() => this.createSpace(actor, args)),
    );

    server.registerTool(
      'update_space',
      {
        title: 'Update space',
        description: "Update a space's name or description.",
        inputSchema: z.object({
          spaceId: z.uuid(),
          name: z.string().trim().min(2).max(100).optional(),
          description: z.string().optional(),
        }),
        annotations: { destructiveHint: true },
      },
      (args) => this.run(() => this.updateSpace(actor, args)),
    );

    server.registerTool(
      'get_comments',
      {
        title: 'Get comments',
        description: "Get a page's comments. Content is Markdown.",
        inputSchema: z.object({
          pageId: z.string().min(1),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
          cursor: z.string().optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.getComments(actor, args)),
    );

    server.registerTool(
      'create_comment',
      {
        title: 'Create comment',
        description:
          'Add a comment to a page, or reply to a top-level comment. Content is Markdown.',
        inputSchema: z.object({
          pageId: z.string().min(1),
          content: z.string().min(1).describe('Markdown content'),
          parentCommentId: z.uuid().optional(),
        }),
      },
      (args) => this.run(() => this.createComment(actor, args)),
    );

    server.registerTool(
      'update_comment',
      {
        title: 'Update comment',
        description:
          'Update one of your own comments. Content is Markdown and replaces the existing content.',
        inputSchema: z.object({
          commentId: z.uuid(),
          content: z.string().min(1).describe('Markdown content'),
        }),
        annotations: { destructiveHint: true },
      },
      (args) => this.run(() => this.updateComment(actor, args)),
    );

    server.registerTool(
      'search_attachments',
      {
        title: 'Search attachments',
        description:
          'Search file attachments by file name across pages the current user can read.',
        inputSchema: z.object({
          query: z.string().min(1).max(SEARCH_QUERY_MAX_LENGTH),
          spaceId: z.uuid().optional(),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.searchAttachments(actor, args)),
    );

    server.registerTool(
      'search_file_contents',
      {
        title: 'Search inside files',
        description:
          'Search the text inside attached PDF, DOCX and TXT files (and their names) across pages the current user can read.',
        inputSchema: z.object({
          query: z.string().min(1).max(SEARCH_QUERY_MAX_LENGTH),
          spaceId: z.uuid().optional(),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.searchFileContents(actor, args)),
    );

    server.registerTool(
      'list_workspace_members',
      {
        title: 'List workspace members',
        description: 'List members of the workspace.',
        inputSchema: z.object({
          query: z.string().optional().describe('Filter by name or email'),
          limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
          cursor: z.string().optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      (args) => this.run(() => this.listWorkspaceMembers(actor, args)),
    );

    server.registerTool(
      'get_current_user',
      {
        title: 'Get current user',
        description: 'Get the authenticated user and their workspace.',
        annotations: { readOnlyHint: true },
      },
      () => this.run(async () => this.getCurrentUser(actor)),
    );

    this.registerPageTools(server, actor);

    return server;
  }

  async listSpaces(
    actor: McpActor,
    args: { query?: string; limit?: number; cursor?: string },
  ) {
    const result = await this.spaceMemberService.getUserSpaces(
      actor.user.id,
      this.pagination(args),
    );
    return {
      items: result.items.map((space) => ({
        id: space.id,
        name: space.name,
        slug: space.slug,
        description: space.description,
      })),
      nextCursor: result.meta.nextCursor ?? null,
    };
  }

  async searchPages(
    actor: McpActor,
    args: { query: string; spaceId?: string; limit?: number },
  ) {
    if (args.spaceId) {
      await this.assertSpaceAction(
        actor.user,
        args.spaceId,
        SpaceCaslAction.Read,
      );
    }

    const result = await this.searchService.searchPages(
      { query: args.query, spaceId: args.spaceId, limit: args.limit ?? 20 },
      { userId: actor.user.id, workspaceId: actor.workspace.id },
    );

    return {
      items: result.items.map((item) => ({
        id: item.id,
        title: item.title,
        highlight: item.highlight,
        parentPageId: item.parentPageId,
        space: item.space
          ? { id: item.space.id, name: item.space.name, slug: item.space.slug }
          : undefined,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async getPage(actor: McpActor, args: { pageId: string }) {
    const page = await this.pageRepo.findById(args.pageId, {
      includeSpace: true,
      includeContent: true,
    });
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    const { canEdit } =
      await this.pageAccessService.validateCanViewWithPermissions(
        page,
        actor.user,
      );

    return this.toPageResult(page, { canEdit });
  }

  async listChildPages(
    actor: McpActor,
    args: {
      spaceId?: string;
      pageId?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    if (!args.spaceId && !args.pageId) {
      throw new ForbiddenException('Either spaceId or pageId must be provided');
    }

    let spaceId = args.spaceId;
    if (args.pageId) {
      const page = await this.pageRepo.findById(args.pageId);
      if (!page) {
        throw new ForbiddenException();
      }
      spaceId = page.spaceId;
    }

    const ability = await this.spaceAbility.createForUser(actor.user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    const spaceCanEdit = ability.can(
      SpaceCaslAction.Edit,
      SpaceCaslSubject.Page,
    );

    const result = await this.pageService.getSidebarPages(
      spaceId,
      this.pagination(args),
      args.pageId,
      actor.user.id,
      spaceCanEdit,
    );

    return {
      items: result.items.map((page) => ({
        id: page.id,
        slugId: page.slugId,
        title: page.title,
        hasChildren: page.hasChildren,
      })),
      nextCursor: result.meta.nextCursor ?? null,
    };
  }

  async createPage(
    actor: McpActor,
    args: {
      spaceId: string;
      title?: string;
      content?: string;
      parentPageId?: string;
    },
  ) {
    const { user, workspace } = actor;

    if (args.parentPageId) {
      const parentPage = await this.pageRepo.findById(args.parentPageId);
      if (
        !parentPage ||
        parentPage.deletedAt ||
        parentPage.spaceId !== args.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parentPage, user);
    } else {
      await this.assertSpaceAction(user, args.spaceId, SpaceCaslAction.Create);
    }

    const page = await this.pageService.create(user.id, workspace.id, {
      spaceId: args.spaceId,
      title: args.title,
      parentPageId: args.parentPageId,
      ...(args.content !== undefined && {
        content: args.content,
        format: 'markdown',
      }),
    });

    this.auditService.log({
      event: AuditEvent.PAGE_CREATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: { title: getPageTitle(page.title), spaceId: page.spaceId },
      },
    });

    return this.toPageResult(page, { canEdit: true });
  }

  async updatePage(
    actor: McpActor,
    args: {
      pageId: string;
      title?: string;
      content?: string;
      operation?: 'append' | 'prepend' | 'replace';
    },
  ) {
    if (args.content !== undefined && !args.operation) {
      throw new ForbiddenException(
        'operation is required when content is given',
      );
    }

    const page = await this.pageRepo.findById(args.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, actor.user);

    const updatedPage = await this.pageService.update(
      page,
      {
        pageId: page.id,
        title: args.title,
        ...(args.content !== undefined && {
          content: args.content,
          operation: args.operation,
          format: 'markdown',
        }),
      },
      actor.user,
    );

    return this.toPageResult(updatedPage, { canEdit: true });
  }

  async listPages(
    actor: McpActor,
    args: { spaceId: string; limit?: number; cursor?: string },
  ) {
    await this.assertSpaceAction(
      actor.user,
      args.spaceId,
      SpaceCaslAction.Read,
    );

    const result = await this.pageService.getRecentSpacePages(
      args.spaceId,
      actor.user.id,
      this.pagination(args),
    );

    return {
      items: result.items.map((page) => ({
        id: page.id,
        slugId: page.slugId,
        title: page.title,
        parentPageId: page.parentPageId,
        updatedAt: page.updatedAt,
      })),
      nextCursor: result.meta.nextCursor ?? null,
    };
  }

  // Backs both duplicate_page (no spaceId) and copy_page_to_space.
  async duplicatePage(
    actor: McpActor,
    args: { pageId: string; spaceId?: string },
  ) {
    const { user } = actor;
    const copiedPage = await this.pageRepo.findById(args.pageId);
    if (!copiedPage) {
      throw new NotFoundException('Page to copy not found');
    }

    await this.pageAccessService.validateCanView(copiedPage, user);

    if (args.spaceId) {
      await this.assertSpaceAction(
        user,
        copiedPage.spaceId,
        SpaceCaslAction.Edit,
      );
      await this.assertSpaceAction(user, args.spaceId, SpaceCaslAction.Edit);
    } else {
      await this.assertSpaceAction(
        user,
        copiedPage.spaceId,
        SpaceCaslAction.Edit,
      );
    }

    const result = await this.pageService.duplicatePage(
      copiedPage,
      args.spaceId,
      user,
    );

    this.auditService.log({
      event: AuditEvent.PAGE_DUPLICATED,
      resourceType: AuditResource.PAGE,
      resourceId: result.id,
      spaceId: args.spaceId ?? copiedPage.spaceId,
      metadata: {
        sourcePageId: copiedPage.id,
        title: getPageTitle(copiedPage.title),
        ...(args.spaceId && {
          sourceSpaceId: copiedPage.spaceId,
          targetSpaceId: args.spaceId,
        }),
        ...(result.childPageIds.length > 0 && {
          childPageIds: result.childPageIds,
        }),
      },
    });

    return {
      id: result.id,
      slugId: result.slugId,
      title: result.title,
      spaceId: result.spaceId,
      parentPageId: result.parentPageId,
      childPageIds: result.childPageIds,
    };
  }

  async movePage(
    actor: McpActor,
    args: { pageId: string; parentPageId?: string | null },
  ) {
    const { user } = actor;
    const movedPage = await this.pageRepo.findById(args.pageId);
    if (!movedPage) {
      throw new NotFoundException('Moved page not found');
    }

    await this.assertSpaceAction(user, movedPage.spaceId, SpaceCaslAction.Edit);
    await this.pageAccessService.validateCanEdit(movedPage, user);

    // undefined keeps the current parent, null moves to the space root
    const parentPageId =
      args.parentPageId === undefined
        ? movedPage.parentPageId
        : args.parentPageId;

    if (parentPageId && parentPageId !== movedPage.parentPageId) {
      const targetParent = await this.pageRepo.findById(parentPageId);
      if (!targetParent || targetParent.deletedAt) {
        throw new NotFoundException('Target parent page not found');
      }
      await this.pageAccessService.validateCanEdit(targetParent, user);
    }

    const position = await this.pageService.nextPagePosition(
      movedPage.spaceId,
      parentPageId ?? undefined,
    );

    await this.pageService.movePage(
      { pageId: movedPage.id, position, parentPageId },
      movedPage,
    );

    return { id: movedPage.id, parentPageId: parentPageId ?? null, position };
  }

  async movePageToSpace(
    actor: McpActor,
    args: { pageId: string; spaceId: string },
  ) {
    const { user } = actor;
    const movedPage = await this.pageRepo.findById(args.pageId);
    if (!movedPage) {
      throw new NotFoundException('Page to move not found');
    }
    if (movedPage.spaceId === args.spaceId) {
      throw new BadRequestException('Page is already in this space');
    }

    await this.assertSpaceAction(user, movedPage.spaceId, SpaceCaslAction.Edit);
    await this.assertSpaceAction(user, args.spaceId, SpaceCaslAction.Edit);
    await this.pageAccessService.validateCanEdit(movedPage, user);

    const { childPageIds } = await this.pageService.movePageToSpace(
      movedPage,
      args.spaceId,
      user.id,
    );

    this.auditService.log({
      event: AuditEvent.PAGE_MOVED_TO_SPACE,
      resourceType: AuditResource.PAGE,
      resourceId: movedPage.id,
      spaceId: movedPage.spaceId,
      changes: {
        before: { spaceId: movedPage.spaceId },
        after: { spaceId: args.spaceId },
      },
      metadata: {
        title: getPageTitle(movedPage.title),
        ...(childPageIds.length > 0 && { childPageIds }),
      },
    });

    return { id: movedPage.id, spaceId: args.spaceId, childPageIds };
  }

  async getSpace(actor: McpActor, args: { spaceId: string }) {
    const space = await this.spaceService.getSpaceInfo(
      args.spaceId,
      actor.workspace.id,
    );
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const ability = await this.spaceAbility.createForUser(actor.user, space.id);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }

    const roles = await this.spaceMemberRepo.getUserSpaceRoles(
      actor.user.id,
      space.id,
    );

    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
      createdAt: space.createdAt,
      role: findHighestUserSpaceRole(roles),
    };
  }

  async createSpace(
    actor: McpActor,
    args: { name: string; slug: string; description?: string },
  ) {
    const ability = this.workspaceAbility.createForUser(
      actor.user,
      actor.workspace,
    );
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Space)
    ) {
      throw new ForbiddenException();
    }

    const space = await this.spaceService.createSpace(
      actor.user,
      actor.workspace.id,
      { name: args.name, slug: args.slug, description: args.description },
    );

    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
    };
  }

  async updateSpace(
    actor: McpActor,
    args: { spaceId: string; name?: string; description?: string },
  ) {
    const ability = await this.spaceAbility.createForUser(
      actor.user,
      args.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }

    // only name and description; license-gated space settings stay out
    const space = await this.spaceService.updateSpace(
      {
        spaceId: args.spaceId,
        name: args.name,
        description: args.description,
      } as UpdateSpaceDto,
      actor.workspace.id,
    );

    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
    };
  }

  async getComments(
    actor: McpActor,
    args: { pageId: string; limit?: number; cursor?: string },
  ) {
    const page = await this.findWorkspacePage(actor, args.pageId);
    await this.pageAccessService.validateCanView(page, actor.user);

    const result = await this.commentService.findByPageId(
      page.id,
      this.pagination(args),
    );

    return {
      items: result.items.map((comment) => this.toCommentResult(comment)),
      nextCursor: result.meta.nextCursor ?? null,
    };
  }

  async createComment(
    actor: McpActor,
    args: { pageId: string; content: string; parentCommentId?: string },
  ) {
    const { user, workspace } = actor;
    const page = await this.findWorkspacePage(actor, args.pageId);
    await this.pageAccessService.validateCanComment(page, user, workspace.id);

    const content = await this.markdownToProsemirror(args.content);
    const comment = await this.commentService.create(
      { page, workspaceId: workspace.id, user },
      {
        pageId: page.id,
        content: JSON.stringify(content),
        type: 'page',
        parentCommentId: args.parentCommentId,
      } as CreateCommentDto,
    );

    this.auditService.log({
      event: AuditEvent.COMMENT_CREATED,
      resourceType: AuditResource.COMMENT,
      resourceId: comment.id,
      spaceId: page.spaceId,
      metadata: { pageId: page.id },
    });

    return this.toCommentResult(comment);
  }

  async updateComment(
    actor: McpActor,
    args: { commentId: string; content: string },
  ) {
    const { user, workspace } = actor;
    const comment = await this.commentRepo.findById(args.commentId, {
      includeCreator: true,
      includeResolvedBy: true,
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const page = await this.findWorkspacePage(actor, comment.pageId);
    await this.pageAccessService.validateCanComment(page, user, workspace.id);

    const content = await this.markdownToProsemirror(args.content);
    // CommentService rejects edits to other users' comments
    const updatedComment = await this.commentService.update(
      comment,
      { commentId: comment.id, content: JSON.stringify(content) },
      user,
    );

    this.auditService.log({
      event: AuditEvent.COMMENT_UPDATED,
      resourceType: AuditResource.COMMENT,
      resourceId: comment.id,
      spaceId: comment.spaceId,
      metadata: { pageId: comment.pageId },
    });

    return this.toCommentResult(updatedComment);
  }

  async searchAttachments(
    actor: McpActor,
    args: { query: string; spaceId?: string; limit?: number },
  ) {
    if (args.spaceId) {
      await this.assertSpaceAction(
        actor.user,
        args.spaceId,
        SpaceCaslAction.Read,
      );
    }

    const spaceIds = args.spaceId
      ? [args.spaceId]
      : await this.spaceMemberRepo.getUserSpaceIds(actor.user.id);

    const attachments = await this.attachmentRepo.searchByFileName({
      workspaceId: actor.workspace.id,
      spaceIds,
      query: args.query,
      limit: args.limit ?? 20,
    });

    // drop attachments on restricted pages the user cannot see
    const accessiblePageIds = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: [...new Set(attachments.map((a) => a.pageId))],
        userId: actor.user.id,
      }),
    );

    return {
      items: attachments
        .filter((a) => accessiblePageIds.has(a.pageId))
        .map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          fileSize: a.fileSize,
          pageId: a.pageId,
          spaceId: a.spaceId,
          createdAt: a.createdAt,
        })),
    };
  }

  // Full-text (and, with embeddings, semantic) search inside files.
  async searchFileContents(
    actor: McpActor,
    args: { query: string; spaceId?: string; limit?: number },
  ) {
    if (args.spaceId) {
      await this.assertSpaceAction(
        actor.user,
        args.spaceId,
        SpaceCaslAction.Read,
      );
    }
    const result = await this.searchService.searchAttachments(
      {
        query: args.query,
        spaceId: args.spaceId,
        limit: args.limit ?? 10,
      } as any,
      { userId: actor.user.id, workspaceId: actor.workspace.id },
    );
    return {
      items: result.items.map((item: any) => ({
        id: item.id,
        fileName: item.fileName,
        excerpt: String(item.highlight ?? '')
          .replace(/<[^>]+>/g, '')
          .slice(0, 400),
        page: item.page,
        space: {
          id: item.space?.id,
          name: item.space?.name,
          slug: item.space?.slug,
        },
        url:
          item.space?.slug && item.page?.slugId
            ? `/s/${item.space.slug}/p/${item.page.slugId}`
            : undefined,
      })),
    };
  }

  async listWorkspaceMembers(
    actor: McpActor,
    args: { query?: string; limit?: number; cursor?: string },
  ) {
    const ability = this.workspaceAbility.createForUser(
      actor.user,
      actor.workspace,
    );
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Member)) {
      throw new ForbiddenException();
    }

    const result = await this.userRepo.getUsersPaginated(
      actor.workspace.id,
      this.pagination(args),
    );

    return {
      items: result.items.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })),
      nextCursor: result.meta.nextCursor ?? null,
    };
  }

  getCurrentUser(actor: McpActor) {
    const { user, workspace } = actor;
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      workspace: { id: workspace.id, name: workspace.name },
    };
  }

  private async findWorkspacePage(actor: McpActor, pageId: string) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== actor.workspace.id || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async markdownToProsemirror(markdown: string) {
    const html = await markdownToHtml(markdown);
    return htmlToJson(html as string);
  }

  private toCommentResult(comment: any) {
    return {
      id: comment.id,
      parentCommentId: comment.parentCommentId,
      type: comment.type,
      selection: comment.selection,
      creator: comment.creator
        ? { id: comment.creator.id, name: comment.creator.name }
        : { id: comment.creatorId },
      resolvedAt: comment.resolvedAt,
      createdAt: comment.createdAt,
      editedAt: comment.editedAt,
      content: comment.content ? jsonToMarkdown(comment.content) : '',
    };
  }

  private async assertSpaceAction(
    user: User,
    spaceId: string,
    action: SpaceCaslAction,
  ) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(action, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private pagination(args: {
    query?: string;
    limit?: number;
    cursor?: string;
  }): PaginationOptions {
    return {
      limit: args.limit ?? 20,
      cursor: args.cursor,
      query: args.query,
    } as PaginationOptions;
  }

  private toPageResult(page: Page, permissions: { canEdit: boolean }) {
    const space = (page as any).space;
    return {
      id: page.id,
      slugId: page.slugId,
      title: page.title,
      spaceId: page.spaceId,
      space: space
        ? { id: space.id, name: space.name, slug: space.slug }
        : undefined,
      parentPageId: page.parentPageId,
      updatedAt: page.updatedAt,
      canEdit: permissions.canEdit,
      content: page.content ? jsonToMarkdown(page.content) : '',
    };
  }

  // Block-level page tools (shared with AI chat).
  private registerPageTools(server: McpServer, actor: McpActor) {
    const tools = this.pageTools;
    const reads = {
      get_page_outline: (a: any) => tools.getPageOutline(actor, a),
      get_blocks: (a: any) => tools.getBlocks(actor, a),
      find_blocks: (a: any) => tools.findBlocks(actor, a),
      list_page_history: (a: any) => tools.listPageHistory(actor, a),
      get_diagram: (a: any) => tools.getDiagram(actor, a),
    };
    const writes = {
      apply_operations: (a: any) => tools.applyOperations(actor, a),
      insert_blocks: (a: any) => tools.insertBlocks(actor, a),
      update_block: (a: any) => tools.updateBlock(actor, a),
      move_block: (a: any) => tools.moveBlock(actor, a),
      delete_blocks: (a: any) => tools.deleteBlocks(actor, a),
      undo_ai_edit: (a: any) => tools.undoAiEdit(actor, a),
      restore_page_version: (a: any) => tools.restorePageVersion(actor, a),
    };
    for (const [name, handler] of Object.entries({ ...reads, ...writes })) {
      const readOnly = name in reads;
      server.registerTool(
        name,
        {
          title: name.replace(/_/g, ' '),
          description:
            PAGE_TOOL_DESCRIPTIONS[name] +
            (readOnly ||
            name === 'undo_ai_edit' ||
            name === 'restore_page_version'
              ? ''
              : ` ${BLOCK_GUIDE}`),
          inputSchema: (pageToolSchemas as any)[name],
          annotations: { readOnlyHint: readOnly },
        },
        (args: any) => this.run(() => handler(args)),
      );
    }
  }

  // Permission and validation failures become tool errors the model can read.
  private async run(fn: () => Promise<unknown>): Promise<CallToolResult> {
    try {
      const result = await fn();
      return {
        ...((result as any)?.error && { isError: true }),
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      if (!(err instanceof HttpException)) this.logger.error(err);
      return {
        isError: true,
        content: [
          { type: 'text', text: JSON.stringify(toolError(err), null, 2) },
        ],
      };
    }
  }
}
