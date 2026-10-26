import { ForbiddenException } from '@nestjs/common';
import { McpService } from './mcp.service';

jest.mock('../../collaboration/collaboration.util', () => ({
  jsonToMarkdown: jest.fn(() => '# markdown'),
  htmlToJson: jest.fn((html: string) => ({ type: 'doc', html })),
}));

jest.mock('@docmost/editor-ext', () => ({
  markdownToHtml: jest.fn(async (md: string) => `<p>${md}</p>`),
}));

const actor = {
  user: { id: 'user_1', name: 'Ann', email: 'ann@x.io', role: 'member' },
  workspace: { id: 'ws_1', name: 'WS', licenseKey: 'secret-license' },
} as any;
const page = {
  id: 'page_1',
  spaceId: 'space_1',
  workspaceId: 'ws_1',
  parentPageId: 'parent_1',
  title: 'Hello',
  content: {},
};
const comment = {
  id: 'comment_1',
  pageId: 'page_1',
  spaceId: 'space_1',
  creatorId: 'user_1',
  content: {},
};

function createService(
  opts: {
    canRead?: boolean;
    canEdit?: boolean;
    deniedSpaces?: string[];
    workspaceAllowed?: boolean;
  } = {},
) {
  const abilityFor = (spaceId: string) => ({
    can: jest.fn(() => opts.canEdit ?? true),
    cannot: jest.fn(
      () =>
        !(opts.canRead ?? true) || (opts.deniedSpaces ?? []).includes(spaceId),
    ),
  });
  const deps = {
    pageRepo: { findById: jest.fn().mockResolvedValue(page) },
    pageService: {
      create: jest.fn().mockResolvedValue(page),
      update: jest.fn().mockResolvedValue(page),
      getSidebarPages: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      getRecentSpacePages: jest
        .fn()
        .mockResolvedValue({ items: [page], meta: {} }),
      duplicatePage: jest
        .fn()
        .mockResolvedValue({ ...page, id: 'copy_1', childPageIds: [] }),
      nextPagePosition: jest.fn().mockResolvedValue('a5'),
      movePage: jest.fn().mockResolvedValue(undefined),
      movePageToSpace: jest.fn().mockResolvedValue({ childPageIds: [] }),
    },
    pageAccessService: {
      validateCanView: jest.fn().mockResolvedValue(undefined),
      validateCanViewWithPermissions: jest
        .fn()
        .mockResolvedValue({ canEdit: false, hasRestriction: false }),
      validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
      validateCanComment: jest.fn().mockResolvedValue(undefined),
    },
    searchService: { searchPages: jest.fn().mockResolvedValue({ items: [] }) },
    spaceMemberService: {
      getUserSpaces: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    },
    spaceAbility: {
      createForUser: jest.fn(async (_user, spaceId) => abilityFor(spaceId)),
    },
    auditService: { log: jest.fn() },
    workspaceAbility: {
      createForUser: jest.fn(() => ({
        cannot: jest.fn(() => !(opts.workspaceAllowed ?? true)),
      })),
    },
    spaceService: {
      getSpaceInfo: jest.fn().mockResolvedValue({ id: 'space_1', name: 'S' }),
      createSpace: jest.fn().mockResolvedValue({ id: 'space_2' }),
      updateSpace: jest.fn().mockResolvedValue({ id: 'space_1' }),
    },
    spaceMemberRepo: {
      getUserSpaceRoles: jest.fn().mockResolvedValue([]),
      getUserSpaceIds: jest.fn().mockResolvedValue(['space_1']),
    },
    commentService: {
      findByPageId: jest.fn().mockResolvedValue({ items: [comment], meta: {} }),
      create: jest.fn().mockResolvedValue(comment),
      update: jest.fn().mockResolvedValue(comment),
    },
    commentRepo: { findById: jest.fn().mockResolvedValue(comment) },
    userRepo: {
      getUsersPaginated: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    },
    attachmentRepo: { searchByFileName: jest.fn().mockResolvedValue([]) },
    pagePermissionRepo: {
      filterAccessiblePageIds: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new McpService(
    deps.pageRepo as any,
    deps.pageService as any,
    deps.pageAccessService as any,
    deps.searchService as any,
    deps.spaceMemberService as any,
    deps.spaceAbility as any,
    deps.auditService as any,
    deps.workspaceAbility as any,
    deps.spaceService as any,
    deps.spaceMemberRepo as any,
    deps.commentService as any,
    deps.commentRepo as any,
    deps.userRepo as any,
    deps.attachmentRepo as any,
    deps.pagePermissionRepo as any,
    {} as any,
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
    expect(deps.searchService.searchPages).not.toHaveBeenCalled();
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

describe('McpService page tools', () => {
  it('list_pages requires space read access', async () => {
    const { service, deps } = createService({ canRead: false });

    await expect(
      service.listPages(actor, { spaceId: 'space_1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.getRecentSpacePages).not.toHaveBeenCalled();
  });

  it('duplicate_page requires view access to the source page', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanView.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.duplicatePage(actor, { pageId: 'page_1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.duplicatePage).not.toHaveBeenCalled();
  });

  it('copy_page_to_space requires edit access on the target space', async () => {
    const { service, deps } = createService({ deniedSpaces: ['space_2'] });

    await expect(
      service.duplicatePage(actor, { pageId: 'page_1', spaceId: 'space_2' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.duplicatePage).not.toHaveBeenCalled();
  });

  it('copy_page_to_space copies and audits both spaces', async () => {
    const { service, deps } = createService();

    await service.duplicatePage(actor, {
      pageId: 'page_1',
      spaceId: 'space_2',
    });

    expect(deps.pageService.duplicatePage).toHaveBeenCalledWith(
      page,
      'space_2',
      actor.user,
    );
    expect(deps.auditService.log.mock.calls[0][0].metadata).toMatchObject({
      sourceSpaceId: 'space_1',
      targetSpaceId: 'space_2',
    });
  });

  it('move_page requires edit access to the page', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(service.movePage(actor, { pageId: 'page_1' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(deps.pageService.movePage).not.toHaveBeenCalled();
  });

  it('move_page keeps the current parent when parentPageId is omitted', async () => {
    const { service, deps } = createService();

    await service.movePage(actor, { pageId: 'page_1' });

    expect(deps.pageService.nextPagePosition).toHaveBeenCalledWith(
      'space_1',
      'parent_1',
    );
    expect(deps.pageService.movePage).toHaveBeenCalledWith(
      { pageId: 'page_1', position: 'a5', parentPageId: 'parent_1' },
      page,
    );
  });

  it('move_page with null parent moves the page to the root', async () => {
    const { service, deps } = createService();

    await service.movePage(actor, { pageId: 'page_1', parentPageId: null });

    expect(deps.pageService.movePage).toHaveBeenCalledWith(
      { pageId: 'page_1', position: 'a5', parentPageId: null },
      page,
    );
  });

  it('move_page requires edit access to the new parent', async () => {
    const { service, deps } = createService();
    deps.pageRepo.findById.mockImplementation(async (id: string) =>
      id === 'page_1' ? page : { id, spaceId: 'space_1' },
    );
    deps.pageAccessService.validateCanEdit.mockImplementation(
      async (target: any) => {
        if (target.id === 'other_parent') throw new ForbiddenException();
      },
    );

    await expect(
      service.movePage(actor, {
        pageId: 'page_1',
        parentPageId: 'other_parent',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.movePage).not.toHaveBeenCalled();
  });

  it('move_page_to_space requires edit access on the target space', async () => {
    const { service, deps } = createService({ deniedSpaces: ['space_2'] });

    await expect(
      service.movePageToSpace(actor, { pageId: 'page_1', spaceId: 'space_2' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.movePageToSpace).not.toHaveBeenCalled();
  });

  it('move_page_to_space rejects moving into the same space', async () => {
    const { service, deps } = createService();

    await expect(
      service.movePageToSpace(actor, { pageId: 'page_1', spaceId: 'space_1' }),
    ).rejects.toThrow('already in this space');
    expect(deps.pageService.movePageToSpace).not.toHaveBeenCalled();
  });
});

describe('McpService space tools', () => {
  it('get_space requires space settings read access', async () => {
    const { service } = createService({ canRead: false });

    await expect(
      service.getSpace(actor, { spaceId: 'space_1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create_space requires workspace space management', async () => {
    const { service, deps } = createService({ workspaceAllowed: false });

    await expect(
      service.createSpace(actor, { name: 'New', slug: 'new' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.spaceService.createSpace).not.toHaveBeenCalled();
  });

  it('update_space requires space settings management', async () => {
    const { service, deps } = createService({ canRead: false });

    await expect(
      service.updateSpace(actor, { spaceId: 'space_1', name: 'Renamed' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.spaceService.updateSpace).not.toHaveBeenCalled();
  });

  it('update_space only forwards name and description', async () => {
    const { service, deps } = createService();

    await service.updateSpace(actor, {
      spaceId: 'space_1',
      name: 'Renamed',
      disablePublicSharing: true,
    } as any);

    expect(deps.spaceService.updateSpace).toHaveBeenCalledWith(
      { spaceId: 'space_1', name: 'Renamed', description: undefined },
      'ws_1',
    );
  });
});

describe('McpService comment tools', () => {
  it('get_comments requires page view access', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanView.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.getComments(actor, { pageId: 'page_1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.commentService.findByPageId).not.toHaveBeenCalled();
  });

  it('get_comments rejects pages from another workspace', async () => {
    const { service, deps } = createService();
    deps.pageRepo.findById.mockResolvedValue({ ...page, workspaceId: 'ws_2' });

    await expect(
      service.getComments(actor, { pageId: 'page_1' }),
    ).rejects.toThrow('Page not found');
  });

  it('create_comment requires comment access', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanComment.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.createComment(actor, { pageId: 'page_1', content: 'hi' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.commentService.create).not.toHaveBeenCalled();
  });

  it('create_comment converts markdown to prosemirror json', async () => {
    const { service, deps } = createService();

    await service.createComment(actor, { pageId: 'page_1', content: 'hi' });

    const dto = deps.commentService.create.mock.calls[0][1];
    expect(JSON.parse(dto.content)).toEqual({ type: 'doc', html: '<p>hi</p>' });
    expect(dto.type).toBe('page');
    expect(deps.auditService.log).toHaveBeenCalled();
  });

  it('update_comment requires comment access', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanComment.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.updateComment(actor, { commentId: 'comment_1', content: 'x' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.commentService.update).not.toHaveBeenCalled();
  });
});

describe('McpService other tools', () => {
  it('search_attachments requires read access to a given space', async () => {
    const { service, deps } = createService({ canRead: false });

    await expect(
      service.searchAttachments(actor, { query: 'x', spaceId: 'space_1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.attachmentRepo.searchByFileName).not.toHaveBeenCalled();
  });

  it('search_attachments hides attachments on inaccessible pages', async () => {
    const { service, deps } = createService();
    deps.attachmentRepo.searchByFileName.mockResolvedValue([
      { id: 'a1', pageId: 'page_1', fileName: 'ok.pdf' },
      { id: 'a2', pageId: 'secret', fileName: 'hidden.pdf' },
    ]);
    deps.pagePermissionRepo.filterAccessiblePageIds.mockResolvedValue([
      'page_1',
    ]);

    const result = await service.searchAttachments(actor, { query: 'pdf' });

    expect(deps.attachmentRepo.searchByFileName).toHaveBeenCalledWith(
      expect.objectContaining({ spaceIds: ['space_1'] }),
    );
    expect(result.items.map((a) => a.id)).toEqual(['a1']);
  });

  it('list_workspace_members requires member read access', async () => {
    const { service, deps } = createService({ workspaceAllowed: false });

    await expect(service.listWorkspaceMembers(actor, {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(deps.userRepo.getUsersPaginated).not.toHaveBeenCalled();
  });

  it('get_current_user does not leak the license key', () => {
    const { service } = createService();

    const result = service.getCurrentUser(actor);

    expect(JSON.stringify(result)).not.toContain('secret-license');
    expect(result.user.id).toBe('user_1');
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
      'apply_operations',
      'copy_page_to_space',
      'create_comment',
      'create_page',
      'create_space',
      'delete_blocks',
      'duplicate_page',
      'find_blocks',
      'get_blocks',
      'get_comments',
      'get_current_user',
      'get_page',
      'get_page_outline',
      'get_space',
      'insert_blocks',
      'list_child_pages',
      'list_page_history',
      'list_pages',
      'list_spaces',
      'list_workspace_members',
      'move_block',
      'move_page',
      'move_page_to_space',
      'restore_page_version',
      'search_attachments',
      'search_file_contents',
      'search_pages',
      'undo_ai_edit',
      'update_block',
      'update_comment',
      'update_page',
      'update_space',
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
