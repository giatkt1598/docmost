import { ForbiddenException } from '@nestjs/common';
import {
  buildChatSystemPrompt,
  buildChatTools,
  chatTitle,
} from './ai-chat.service';

const actor = { user: { id: 'u1' }, workspace: { id: 'ws' } } as any;
const run = (t: any, args: any) =>
  t.execute(args, { toolCallId: 'c1', messages: [] });

describe('buildChatTools', () => {
  it('only offers reading tools in read-only mode', () => {
    expect(Object.keys(buildChatTools({} as any, actor, true)).sort()).toEqual([
      'get_page',
      'list_child_pages',
      'list_spaces',
      'search_pages',
    ]);
    expect(Object.keys(buildChatTools({} as any, actor, false))).toEqual(
      expect.arrayContaining(['create_page', 'update_page']),
    );
  });

  it('runs MCP tools as the user and adds page links', async () => {
    const mcp = {
      searchPages: jest.fn().mockResolvedValue({
        items: [{ id: 'p1', slugId: 'abc', space: { slug: 'eng' } }],
      }),
    };
    const tools = buildChatTools(mcp as any, actor, true);

    const out = JSON.parse(await run(tools.search_pages, { query: 'vpn' }));
    expect(mcp.searchPages).toHaveBeenCalledWith(actor, {
      query: 'vpn',
      limit: 10,
    });
    expect(out[0].url).toBe('/s/eng/p/abc');
  });

  it('resolves a space slug before creating a page', async () => {
    const mcp = {
      createPage: jest
        .fn()
        .mockResolvedValue({ id: 'p1', slugId: 'abc', space: { slug: 'eng' } }),
    };
    const resolve = jest.fn(async (v: string) =>
      v === 'eng' ? 'space-uuid' : v,
    );
    const tools = buildChatTools(mcp as any, actor, false, resolve);

    const out = JSON.parse(
      await run(tools.create_page, { spaceId: 'eng', title: 'Notes' }),
    );
    expect(mcp.createPage).toHaveBeenCalledWith(actor, {
      spaceId: 'space-uuid',
      title: 'Notes',
    });
    expect(out.url).toBe('/s/eng/p/abc');
  });

  it('turns permission errors into text the model can read', async () => {
    const mcp = {
      getPage: jest.fn().mockRejectedValue(new ForbiddenException('No access')),
    };
    const tools = buildChatTools(mcp as any, actor, true);
    expect(JSON.parse(await run(tools.get_page, { pageId: 'x' }))).toEqual({
      error: 'No access',
    });
  });

  it('truncates very long results', async () => {
    const mcp = {
      getPage: jest.fn().mockResolvedValue({ content: 'x'.repeat(50_000) }),
    };
    const tools = buildChatTools(mcp as any, actor, true);
    const out: string = await run(tools.get_page, { pageId: 'p' });
    expect(out.length).toBeLessThan(12_100);
    expect(out.endsWith('(truncated)')).toBe(true);
  });
});

describe('buildChatSystemPrompt', () => {
  const base = { workspaceName: 'Acme', userName: 'Ann' };

  it('reflects the workspace controls', () => {
    const strict = buildChatSystemPrompt({
      ...base,
      settings: { readOnly: true, workspaceKnowledgeOnly: true },
    });
    expect(strict).toMatch(/only read the wiki/);
    expect(strict).toMatch(/Only answer from content found in the wiki/);

    const open = buildChatSystemPrompt({
      ...base,
      settings: { readOnly: false, workspaceKnowledgeOnly: false },
    });
    expect(open).toMatch(/only when the user explicitly asks/);
    expect(open).not.toMatch(/general knowledge/);
  });

  it('mentions the page being viewed', () => {
    expect(
      buildChatSystemPrompt({
        ...base,
        settings: { readOnly: true, workspaceKnowledgeOnly: false },
        currentPage: { id: 'p1', title: 'VPN' },
      }),
    ).toMatch(/viewing the page "VPN" \(id p1\)/);
  });
});

describe('chatTitle', () => {
  it('uses the first message on one line, shortened', () => {
    expect(chatTitle('  Hello\n world ')).toBe('Hello world');
    expect(chatTitle('a'.repeat(100))).toHaveLength(60);
    expect(chatTitle('   ')).toBe('New chat');
  });
});
