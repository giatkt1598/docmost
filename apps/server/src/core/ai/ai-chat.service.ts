import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ModelMessage, stepCountIs, streamText, tool, ToolSet } from 'ai';
import { z } from 'zod';
import { AiChat, User, Workspace } from '@docmost/db/types/entity.types';
import { AiChatRepo } from '@docmost/db/repos/ai/ai-chat.repo';
import { McpActor, McpService } from '../mcp/mcp.service';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { AiProviderService } from './ai-provider.service';

const HISTORY_MESSAGES = 30;
const MAX_STEPS = 8;
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
  | { type: 'tool-result'; id: string; name: string; ok: boolean }
  | { type: 'error'; message: string }
  | { type: 'done'; messageId: string };

export type SavedToolCall = {
  id: string;
  name: string;
  input: unknown;
  ok?: boolean;
};

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
    const message =
      err instanceof HttpException ? err.message : 'The tool failed';
    return JSON.stringify({ error: message });
  }
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
): ToolSet {
  const withSpace = async <T extends { spaceId?: string }>(args: T) =>
    args.spaceId
      ? { ...args, spaceId: await resolveSpace(args.spaceId) }
      : args;

  const tools: ToolSet = {
    search_pages: tool({
      description:
        'Full-text search across the wiki pages the user can read. Use short keyword queries; try other keywords if nothing is found.',
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
        'Change a page title and/or content (Markdown, appended, prepended or replacing the content). Only when the user asks for it.',
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
  return tools;
}

export function buildChatSystemPrompt(opts: {
  workspaceName: string;
  userName: string;
  settings: ChatSettings;
  currentPage?: { id: string; title: string } | null;
}): string {
  const lines = [
    `You are the AI assistant of the "${opts.workspaceName}" wiki, talking to ${opts.userName}.`,
    'Use the tools to search and read pages before answering questions about the wiki, its documents, processes or people.',
    'When you use a page, link it in Markdown with the url from the tool result, e.g. [Title](/s/space/p/abc123).',
    'Answer in the language the user writes in. Be concise and format answers as Markdown.',
  ];
  if (opts.settings.workspaceKnowledgeOnly) {
    lines.push(
      'Only answer from content found in the wiki. If the wiki has no answer, say so instead of using general knowledge.',
    );
  }
  lines.push(
    opts.settings.readOnly
      ? 'You can only read the wiki; you cannot create or change pages.'
      : 'Create or change pages only when the user explicitly asks you to.',
  );
  if (opts.currentPage) {
    lines.push(
      `The user is currently viewing the page "${opts.currentPage.title}" (id ${opts.currentPage.id}); "this page" refers to it.`,
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
  ) {}

  // a slug becomes the id of that space; access is checked by the tool
  private spaceResolver(workspace: Workspace): SpaceResolver {
    return async (value) => {
      if (UUID.test(value)) return value;
      const space = await this.spaceRepo.findBySlug(value, workspace.id);
      return space?.id ?? value;
    };
  }

  list(user: User, workspace: Workspace, query?: string) {
    return this.chatRepo.listChats(user.id, workspace.id, { query });
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
    settings: ChatSettings;
    abort: AbortSignal;
  }): AsyncGenerator<ChatEvent> {
    const { user, workspace } = opts;
    const model = await this.aiProvider.model(workspace.id, 'chat');
    const chat = opts.chatId
      ? await this.find(user, workspace, opts.chatId)
      : await this.chatRepo.createChat(
          user.id,
          workspace.id,
          chatTitle(opts.message),
        );
    yield { type: 'chat', chat };

    await this.chatRepo.insertMessage({
      chatId: chat.id,
      workspaceId: workspace.id,
      userId: user.id,
      role: 'user',
      content: opts.message,
    });

    const actor: McpActor = { user, workspace };
    let currentPage: { id: string; title: string } | null = null;
    if (opts.pageId) {
      // only mention pages the user can actually read
      const page: any = await this.mcp
        .getPage(actor, { pageId: opts.pageId })
        .catch(() => null);
      if (page) currentPage = { id: page.id, title: page.title || 'Untitled' };
    }

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
      }),
      messages,
      tools: buildChatTools(
        this.mcp,
        actor,
        opts.settings.readOnly,
        this.spaceResolver(workspace),
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
          if (call) call.ok = ok;
          yield {
            type: 'tool-result',
            id: part.toolCallId,
            name: part.toolName,
            ok,
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
