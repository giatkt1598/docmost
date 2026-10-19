import {
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
import { SearchService } from '../search/search.service';
import { SpaceMemberService } from '../space/services/space-member.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { jsonToMarkdown } from '../../collaboration/collaboration.util';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { getPageTitle } from '../../common/helpers';
import { SEARCH_QUERY_MAX_LENGTH } from '../search/dto/search.dto';

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
    private readonly searchService: SearchService,
    private readonly spaceMemberService: SpaceMemberService,
    private readonly spaceAbility: SpaceAbilityFactory,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
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

    const result = await this.searchService.searchPage(
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

  // Permission and validation failures become tool errors the model can read.
  private async run(fn: () => Promise<unknown>): Promise<CallToolResult> {
    try {
      const result = await fn();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      if (err instanceof HttpException) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
      this.logger.error(err);
      return {
        isError: true,
        content: [{ type: 'text', text: 'Internal error' }],
      };
    }
  }
}
