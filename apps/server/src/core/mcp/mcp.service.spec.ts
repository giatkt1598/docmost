import { ForbiddenException } from '@nestjs/common';
import { McpService } from './mcp.service';

jest.mock('../../collaboration/collaboration.util', () => ({
  jsonToMarkdown: jest.fn(() => '# markdown'),
}));

const actor = { user: { id: 'user_1' }, workspace: { id: 'ws_1' } } as any;
const page = { id: 'page_1', spaceId: 'space_1', title: 'Hello', content: {} };

function createService(opts: { canRead?: boolean; canEdit?: boolean } = {}) {
  const ability = {
    can: jest.fn(() => opts.canEdit ?? true),
    cannot: jest.fn(() => !(opts.canRead ?? true)),
  };
  const deps = {
    pageRepo: { findById: jest.fn().mockResolvedValue(page) },
    pageService: {
      create: jest.fn().mockResolvedValue(page),
      update: jest.fn().mockResolvedValue(page),
      getSidebarPages: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    },
    pageAccessService: {
      validateCanViewWithPermissions: jest
        .fn()
        .mockResolvedValue({ canEdit: false, hasRestriction: false }),
      validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
    },
    searchService: { searchPage: jest.fn().mockResolvedValue({ items: [] }) },
    spaceMemberService: {
      getUserSpaces: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    },
    spaceAbility: { createForUser: jest.fn().mockResolvedValue(ability) },
    auditService: { log: jest.fn() },
  };
  const service = new McpService(
    deps.pageRepo as any,
    deps.pageService as any,
    deps.pageAccessService as any,
    deps.searchService as any,
    deps.spaceMemberService as any,
    deps.spaceAbility as any,
    deps.auditService as any,
  );
  return { service, deps };
}

describe('McpService tools', () => {
  it('get_page enforces page view access', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanViewWithPermissions.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(service.getPage(actor, { pageId: 'page_1' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('get_page returns markdown content', async () => {
    const { service } = createService();

    const result = await service.getPage(actor, { pageId: 'page_1' });
    expect(result.content).toEqual('# markdown');
    expect(result.canEdit).toBe(false);
  });

  it('search_pages checks space read access when a space is given', async () => {
    const { service, deps } = createService({ canRead: false });

    await expect(
      service.searchPages(actor, { query: 'x', spaceId: 'space_1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.searchService.searchPage).not.toHaveBeenCalled();
  });

  it('list_child_pages checks space read access', async () => {
    const { service, deps } = createService({ canRead: false });

    await expect(
      service.listChildPages(actor, { spaceId: 'space_1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.getSidebarPages).not.toHaveBeenCalled();
  });

  it('create_page at root requires space create permission', async () => {
    const { service, deps } = createService({ canRead: false });

    await expect(
      service.createPage(actor, { spaceId: 'space_1', title: 'New' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.create).not.toHaveBeenCalled();
  });

  it('create_page under a parent requires edit access to the parent', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.createPage(actor, { spaceId: 'space_1', parentPageId: 'page_1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.create).not.toHaveBeenCalled();
  });

  it('create_page passes markdown content through', async () => {
    const { service, deps } = createService();

    await service.createPage(actor, { spaceId: 'space_1', content: '# Hi' });
    expect(deps.pageService.create).toHaveBeenCalledWith('user_1', 'ws_1', {
      spaceId: 'space_1',
      title: undefined,
      parentPageId: undefined,
      content: '# Hi',
      format: 'markdown',
    });
    expect(deps.auditService.log).toHaveBeenCalled();
  });

  it('update_page requires edit access', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.updatePage(actor, { pageId: 'page_1', title: 'x' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.update).not.toHaveBeenCalled();
  });

  it('update_page requires an operation with content', async () => {
    const { service, deps } = createService();

    await expect(
      service.updatePage(actor, { pageId: 'page_1', content: 'x' }),
    ).rejects.toThrow('operation is required');
    expect(deps.pageService.update).not.toHaveBeenCalled();
  });
});

describe('McpService HTTP handler', () => {
  async function rpc(service: McpService, body: object) {
    const handler = service.createHandler(actor);
    const response = await handler.fetch(
      new Request('http://localhost/api/mcp-server', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
      }),
      { parsedBody: { jsonrpc: '2.0', id: 1, ...body } },
    );
    const text = await response.text();
    await handler.close();
    // stateless legacy responses may come back as a single SSE event
    const json = text.startsWith('{')
      ? text
      : text
          .split('\n')
          .find((l) => l.startsWith('data:'))!
          .slice(5);
    return { status: response.status, body: JSON.parse(json) };
  }

  it('lists the registered tools', async () => {
    const { service } = createService();

    const { status, body } = await rpc(service, { method: 'tools/list' });

    expect(status).toBe(200);
    expect(body.result.tools.map((t: any) => t.name).sort()).toEqual([
      'create_page',
      'get_page',
      'list_child_pages',
      'list_spaces',
      'search_pages',
      'update_page',
    ]);
  });

  it('returns permission failures as tool errors', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanViewWithPermissions.mockRejectedValue(
      new ForbiddenException('Forbidden'),
    );

    const { body } = await rpc(service, {
      method: 'tools/call',
      params: { name: 'get_page', arguments: { pageId: 'page_1' } },
    });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toEqual('Forbidden');
  });
});
