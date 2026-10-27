import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModelMessage, stepCountIs, streamText, tool, ToolSet } from 'ai';
import { z } from 'zod';
import { AiChat, User, Workspace } from '@docmost/db/types/entity.types';
import { AiChatRepo } from '@docmost/db/repos/ai/ai-chat.repo';
import { McpActor, McpService } from '../mcp/mcp.service';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { AiProviderService } from './ai-provider.service';
import { AiPageToolsService } from '../ai-tools/ai-page-tools.service';
import { toolError } from '../ai-tools/tool-error';
import {
  BLOCK_GUIDE,
  PAGE_TOOL_DESCRIPTIONS,
  pageToolSchemas,
} from '../ai-tools/tool-schemas';

const HISTORY_MESSAGES = 30;
const MAX_STEPS = 20;
const OUTLINE_HEADINGS = 40;
const MAX_TOOL_RESULT_CHARS = 12_000;
const TITLE_LENGTH = 60;

export type ChatSettings = {
  // only reading tools: the assistant cannot create or change pages
  readOnly: boolean;
  // answer only from workspace content, not from general knowledge
  workspaceKnowledgeOnly: boolean;
};

export type ChatEvent =
  | { type: 'chat'; chat: AiChat }
  | { type: 'text'; text: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | {
      type: 'tool-result';
      id: string;
      name: string;
      ok: boolean;
      editId?: string;
    }
  | { type: 'error'; message: string }
  | { type: 'done'; messageId: string };

export type SavedToolCall = {
  id: string;
  name: string;
  input: unknown;
  ok?: boolean;
  // page edits: what Undo needs
  editId?: string;
};

export type PageContext = {
  id: string;
  title: string;
  canEdit: boolean;
  path: string[];
  headings: { id: string; level: number; text: string }[];
};

export type SelectionContext = { text: string; blockIds: string[] };

function pageUrl(page: { slugId?: string; space?: { slug?: string } }) {
  return page?.slugId && page.space?.slug
    ? `/s/${page.space.slug}/p/${page.slugId}`
    : undefined;
}

// Tool output the model can read: large pages are cut, errors become text.
async function runTool(fn: () => Promise<unknown>) {
  try {
    const json = JSON.stringify(await fn());
    return json.length > MAX_TOOL_RESULT_CHARS
      ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… (truncated)`
      : json;
  } catch (err) {
    if (!(err instanceof HttpException)) {
      new Logger('AiChatTools').error(err);
    }
    return JSON.stringify(toolError(err));
  }
}

// The edit_id a page write returned, for the Undo button.
function editIdOf(output: unknown): string | undefined {
  const match = /"edit_id":"([0-9a-f-]{36})"/.exec(String(output ?? ''));
  return match?.[1];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPACE_FIELD = 'Space id or slug';

// Models often pass a space slug where an id is expected; accept both.
export type SpaceResolver = (idOrSlug: string) => Promise<string>;

// The assistant's tools are the MCP tools, so they apply exactly the same
// permission checks as the REST API for the signed-in user.
export function buildChatTools(
  mcp: McpService,
  actor: McpActor,
  readOnly: boolean,
  resolveSpace: SpaceResolver = async (value) => value,
  pageTools?: AiPageToolsService,
  chatId?: string,
): ToolSet {
  const withSpace = async <T extends { spaceId?: string }>(args: T) =>
    args.spaceId
      ? { ...args, spaceId: await resolveSpace(args.spaceId) }
      : args;

  const tools: ToolSet = {
    search_pages: tool({
      description:
        'Full-text search across the pages the user can read. Use short keyword queries; try other keywords if nothing is found.',
      inputSchema: z.object({
        query: z.string().min(1).max(200),
        spaceId: z.string().optional().describe(SPACE_FIELD),
      }),
      execute: (args) =>
        runTool(async () => {
          const result = await mcp.searchPages(actor, {
            ...(await withSpace(args)),
            limit: 10,
          });
          return result.items.map((p: any) => ({
            ...p,
            url: pageUrl(p),
          }));
        }),
    }),
    get_page: tool({
      description:
        'Read a page with its content as Markdown. Use it before answering from a page.',
      inputSchema: z.object({
        pageId: z.string().min(1).describe('Page id or slug id'),
      }),
      execute: (args) =>
        runTool(async () => {
          const page: any = await mcp.getPage(actor, args);
          return { ...page, url: pageUrl(page) };
        }),
    }),
    list_spaces: tool({
      description: 'List the spaces the user is a member of.',
      inputSchema: z.object({ query: z.string().optional() }),
      execute: (args) =>
        runTool(() => mcp.listSpaces(actor, { ...args, limit: 50 })),
    }),
    list_child_pages: tool({
      description:
        'List the root pages of a space, or the direct children of a page.',
      inputSchema: z.object({
        spaceId: z.string().optional().describe(SPACE_FIELD),
        pageId: z.string().optional(),
      }),
      execute: (args) =>
        runTool(async () =>
          mcp.listChildPages(actor, { ...(await withSpace(args)), limit: 50 }),
        ),
    }),
  };

  if (!readOnly) {
    tools.create_page = tool({
      description:
        'Create a page in a space, optionally under a parent page. Only when the user asks for it.',
      inputSchema: z.object({
        spaceId: z.string().min(1).describe(SPACE_FIELD),
        title: z.string().optional(),
        content: z.string().optional().describe('Markdown content'),
        parentPageId: z.string().optional(),
      }),
      execute: (args) =>
        runTool(async () => {
          const page: any = await mcp.createPage(actor, {
            ...args,
            spaceId: await resolveSpace(args.spaceId),
          });
          return { id: page?.id, title: page?.title, url: pageUrl(page) };
        }),
    });
    tools.update_page = tool({
      description:
        'Change a page title, or append/prepend/replace its whole content as Markdown. To change part of a page use the block tools (apply_operations) instead. Only when the user asks for it.',
      inputSchema: z.object({
        pageId: z.string().min(1),
        title: z.string().optional(),
        content: z.string().optional(),
        operation: z.enum(['append', 'prepend', 'replace']).optional(),
      }),
      execute: (args) =>
        runTool(async () => {
          const page: any = await mcp.updatePage(actor, args);
          return { id: page?.id, title: page?.title, url: pageUrl(page) };
        }),
    });
  }

  // the rest of the workspace the assistant can reach
  tools.search_file_contents = tool({
    description:
      'Search the text inside attached PDF, DOCX and TXT files. Results link to the page holding each file.',
    inputSchema: z.object({
      query: z.string().min(1).max(200),
      spaceId: z.string().optional().describe(SPACE_FIELD),
    }),
    execute: (args) =>
      runTool(async () =>
        mcp.searchFileContents(actor, {
          ...(await withSpace(args)),
          limit: 10,
        }),
      ),
  });
  tools.list_comments = tool({
    description: 'Read the comments of a page.',
    inputSchema: z.object({ pageId: z.string().min(1) }),
    execute: (args) =>
      runTool(() => mcp.getComments(actor, { ...args, limit: 50 })),
  });
  tools.list_workspace_members = tool({
    description:
      'Find people in the workspace (name, email); use their id to mention them.',
    inputSchema: z.object({ query: z.string().optional() }),
    execute: (args) =>
      runTool(() => mcp.listWorkspaceMembers(actor, { ...args, limit: 20 })),
  });
  if (!readOnly) {
    tools.add_comment = tool({
      description:
        'Add a comment (Markdown) to a page, or reply to a comment. Only when the user asks for it.',
      inputSchema: z.object({
        pageId: z.string().min(1),
        content: z.string().min(1).max(5000),
        parentCommentId: z.string().optional(),
      }),
      execute: (args) => runTool(() => mcp.createComment(actor, args)),
    });
    tools.move_page = tool({
      description:
        'Move a page under another page of the same space, or to the top level with parentPageId null. Only when the user asks for it.',
      inputSchema: z.object({
        pageId: z.string().min(1),
        parentPageId: z.string().nullable().optional(),
      }),
      execute: (args) => runTool(() => mcp.movePage(actor, args)),
    });
    tools.duplicate_page = tool({
      description:
        'Copy a page (with its sub-pages), optionally into another space. Only when the user asks for it.',
      inputSchema: z.object({
        pageId: z.string().min(1),
        spaceId: z.string().optional().describe(SPACE_FIELD),
      }),
      execute: (args) =>
        runTool(async () => mcp.duplicatePage(actor, await withSpace(args))),
    });
  }

  if (pageTools) {
    const ctx = { aiChatId: chatId };
    const pageTool = (
      name: keyof typeof pageToolSchemas,
      run: (args: any) => Promise<unknown>,
      guide = false,
    ) =>
      tool({
        description:
          PAGE_TOOL_DESCRIPTIONS[name] + (guide ? ` ${BLOCK_GUIDE}` : ''),
        inputSchema: pageToolSchemas[name] as any,
        execute: (args: any) => runTool(() => run(args)),
      });
    tools.get_page_outline = pageTool('get_page_outline', (a) =>
      pageTools.getPageOutline(actor, a),
    );
    tools.get_blocks = pageTool('get_blocks', (a) =>
      pageTools.getBlocks(actor, a),
    );
    tools.find_blocks = pageTool('find_blocks', (a) =>
      pageTools.findBlocks(actor, a),
    );
    tools.get_diagram = pageTool('get_diagram', (a) =>
      pageTools.getDiagram(actor, a),
    );
    tools.list_page_history = pageTool('list_page_history', (a) =>
      pageTools.listPageHistory(actor, a),
    );
    if (!readOnly) {
      tools.apply_operations = pageTool(
        'apply_operations',
        (a) => pageTools.applyOperations(actor, a, ctx),
        true,
      );
      tools.insert_blocks = pageTool(
        'insert_blocks',
        (a) => pageTools.insertBlocks(actor, a, ctx),
        true,
      );
      tools.update_block = pageTool(
        'update_block',
        (a) => pageTools.updateBlock(actor, a, ctx),
        true,
      );
      tools.move_block = pageTool('move_block', (a) =>
        pageTools.moveBlock(actor, a, ctx),
      );
      tools.delete_blocks = pageTool('delete_blocks', (a) =>
        pageTools.deleteBlocks(actor, a, ctx),
      );
      tools.undo_ai_edit = pageTool('undo_ai_edit', (a) =>
        pageTools.undoAiEdit(actor, a),
      );
      tools.restore_page_version = pageTool('restore_page_version', (a) =>
        pageTools.restorePageVersion(actor, a, ctx),
      );
    }
  }
  return tools;
}

export function buildChatSystemPrompt(opts: {
  workspaceName: string;
  userName: string;
  settings: ChatSettings;
  currentPage?: PageContext | null;
  selection?: SelectionContext | null;
}): string {
  const lines = [
    `You are the AI assistant of the "${opts.workspaceName}" workspace, talking to ${opts.userName}.`,
    'Use the tools to search and read pages before answering questions about the pages, their documents, processes or people.',
    'When you use a page, link it in Markdown with the url from the tool result, e.g. [Title](/s/space/p/abc123).',
    'Answer in the language the user writes in. Be concise and format answers as Markdown.',
  ];
  if (opts.settings.workspaceKnowledgeOnly) {
    lines.push(
      'Only answer from content found in the pages. If the pages have no answer, say so instead of using general knowledge.',
    );
  }
  lines.push(
    opts.settings.readOnly
      ? 'You can only read pages; you cannot create or change pages.'
      : 'Create or change pages only when the user explicitly asks you to.',
  );
  if (!opts.settings.readOnly) {
    lines.push(
      'To change part of a page, work on blocks: find the place (get_page_outline, find_blocks, get_blocks), plan the smallest set of operations, apply them in one apply_operations call with a short summary and the rev of every block you change, check the blocks it returns, then tell the user what changed.',
      'Never rewrite a whole page to change part of it. If you get CONFLICT, read the blocks again and re-plan. Keep content you were not asked to change, including extra_marks and inline spans.',
      'Every edit can be undone with undo_ai_edit and the edit_id it returned.',
    );
  }
  const page = opts.currentPage;
  if (page) {
    lines.push(
      `The user is currently viewing the page "${page.title}" (id ${page.id}${page.path.length ? `, under ${page.path.join(' / ')}` : ''}); "this page" refers to it. The user ${page.canEdit ? 'can' : 'cannot'} edit it.`,
    );
    if (page.headings.length) {
      lines.push(
        'Its outline (heading block ids):',
        ...page.headings.map(
          (h) =>
            `${'  '.repeat(Math.max(0, h.level - 1))}- [${h.id}] ${h.text}`,
        ),
      );
    }
  }
  if (opts.selection?.text) {
    lines.push(
      `The user has selected this text on the page${opts.selection.blockIds.length ? ` (blocks ${opts.selection.blockIds.join(', ')})` : ''}; "the selection" or "this" refers to it:`,
      opts.selection.text.slice(0, 4000),
    );
  }
  return lines.join('\n');
}

export function chatTitle(message: string): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  return oneLine.length > TITLE_LENGTH
    ? `${oneLine.slice(0, TITLE_LENGTH - 1)}…`
    : oneLine || 'New chat';
}

@Injectable()
export class AiChatService {
  constructor(
    private readonly chatRepo: AiChatRepo,
    private readonly mcp: McpService,
    private readonly aiProvider: AiProviderService,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageTools: AiPageToolsService,
  ) {}

  // a slug becomes the id of that space; access is checked by the tool
  private spaceResolver(workspace: Workspace): SpaceResolver {
    return async (value) => {
      if (UUID.test(value)) return value;
      const space = await this.spaceRepo.findBySlug(value, workspace.id);
      return space?.id ?? value;
    };
  }

  list(user: User, workspace: Workspace, query?: string, pageId?: string) {
    return this.chatRepo.listChats(user.id, workspace.id, { query, pageId });
  }

  async info(user: User, workspace: Workspace, chatId: string) {
    const chat = await this.find(user, workspace, chatId);
    const messages = await this.chatRepo.listMessages(chat.id);
    return { chat, messages };
  }

  async rename(
    user: User,
    workspace: Workspace,
    chatId: string,
    title: string,
  ) {
    await this.find(user, workspace, chatId);
    return this.chatRepo.updateChat(chatId, workspace.id, { title });
  }

  async remove(user: User, workspace: Workspace, chatId: string) {
    await this.find(user, workspace, chatId);
    await this.chatRepo.softDeleteChat(chatId, workspace.id);
  }

  // Adds the user's message, runs the model with tools and saves the reply.
  // Yields events as they happen; the reply is saved even if interrupted.
  async *send(opts: {
    user: User;
    workspace: Workspace;
    chatId?: string;
    message: string;
    pageId?: string;
    selection?: SelectionContext;
    settings: ChatSettings;
    abort: AbortSignal;
  }): AsyncGenerator<ChatEvent> {
    const { user, workspace } = opts;
    const model = await this.aiProvider.model(workspace.id, 'chat');

    const actor: McpActor = { user, workspace };
    let currentPage: PageContext | null = null;
    if (opts.pageId) {
      // only describe pages the user can actually read
      const outline: any = await this.pageTools
        .getPageOutline(actor, { page_id: opts.pageId })
        .catch(() => null);
      if (outline?.page) {
        currentPage = {
          id: outline.page.id,
          title: outline.page.title,
          canEdit: !!outline.page.can_edit,
          path: outline.page.path ?? [],
          headings: (outline.headings ?? [])
            .slice(0, OUTLINE_HEADINGS)
            .map((h: any) => ({ id: h.id, level: h.level, text: h.text })),
        };
      }
    }

    const chat = opts.chatId
      ? await this.find(user, workspace, opts.chatId)
      : await this.chatRepo.createChat(
          user.id,
          workspace.id,
          chatTitle(opts.message),
          // a chat started beside a page belongs to that page
          currentPage?.id,
        );
    yield { type: 'chat', chat };

    await this.chatRepo.insertMessage({
      chatId: chat.id,
      workspaceId: workspace.id,
      userId: user.id,
      role: 'user',
      content: opts.message,
    });

    const history = await this.chatRepo.listMessages(chat.id, {
      last: HISTORY_MESSAGES,
    });
    const messages: ModelMessage[] = history
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const result = streamText({
      model,
      system: buildChatSystemPrompt({
        workspaceName: workspace.name,
        userName: user.name,
        settings: opts.settings,
        currentPage,
        selection: opts.selection,
      }),
      messages,
      tools: buildChatTools(
        this.mcp,
        actor,
        opts.settings.readOnly,
        this.spaceResolver(workspace),
        this.pageTools,
        chat.id,
      ),
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: opts.abort,
      providerOptions: this.aiProvider.providerOptions(),
    });

    let text = '';
    const toolCalls: SavedToolCall[] = [];
    let failure: string | null = null;
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          text += part.text;
          yield { type: 'text', text: part.text };
        } else if (part.type === 'tool-call') {
          toolCalls.push({
            id: part.toolCallId,
            name: part.toolName,
            input: part.input,
          });
          yield {
            type: 'tool-call',
            id: part.toolCallId,
            name: part.toolName,
            input: part.input,
          };
        } else if (part.type === 'tool-result' || part.type === 'tool-error') {
          const ok =
            part.type === 'tool-result' &&
            !String(part.output ?? '').startsWith('{"error"');
          const call = toolCalls.find((c) => c.id === part.toolCallId);
          const editId = ok ? editIdOf(part.output) : undefined;
          if (call) {
            call.ok = ok;
            if (editId) call.editId = editId;
          }
          yield {
            type: 'tool-result',
            id: part.toolCallId,
            name: part.toolName,
            ok,
            ...(editId && { editId }),
          };
        } else if (part.type === 'error') {
          failure = String((part.error as Error)?.message ?? part.error);
        }
      }
    } catch (err) {
      if (!opts.abort.aborted) failure = (err as Error)?.message ?? String(err);
    }

    const saved = await this.chatRepo.insertMessage({
      chatId: chat.id,
      workspaceId: workspace.id,
      userId: null,
      role: 'assistant',
      content: text,
      toolCalls: toolCalls.length ? (toolCalls as any) : null,
      metadata: failure ? ({ error: failure } as any) : null,
    });
    await this.chatRepo.updateChat(chat.id, workspace.id);

    if (failure && !text) {
      yield {
        type: 'error',
        message:
          'The AI provider failed to answer. The chat model must support tool calling.',
      };
    }
    yield { type: 'done', messageId: saved.id };
  }

  private async find(user: User, workspace: Workspace, chatId: string) {
    const chat = await this.chatRepo.findChat(chatId, user.id, workspace.id);
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }
}
