import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TemplateService } from './template.service';
import { TemplateAccessService } from './template-access.service';

jest.mock('../../collaboration/collaboration.util', () => ({
  jsonToNode: jest.fn(),
  jsonToText: jest.fn(() => 'plain text'),
}));

const member = { id: 'member_1', role: 'member' } as any;
const admin = { id: 'admin_1', role: 'admin' } as any;
const workspace = {
  id: 'ws_1',
  settings: { templates: { allowMemberTemplates: true } },
} as any;
const adminsOnly = { id: 'ws_1', settings: {} } as any;
const content = { type: 'doc', content: [] };

function template(overrides: Record<string, any> = {}) {
  return {
    id: 'tpl_1',
    title: 'Runbook',
    icon: '📘',
    spaceId: 'space_1',
    workspaceId: 'ws_1',
    creatorId: 'someone_else',
    content,
    ...overrides,
  } as any;
}

function createService(
  opts: {
    template?: any;
    canCreatePage?: boolean;
    isSpaceAdmin?: boolean;
    userSpaces?: string[];
  } = {},
) {
  const deps = {
    templateRepo: {
      findById: jest.fn().mockResolvedValue(opts.template ?? template()),
      findTemplates: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      insertTemplate: jest.fn().mockResolvedValue({ id: 'tpl_new' }),
      updateTemplate: jest.fn().mockResolvedValue(undefined),
      deleteTemplate: jest.fn().mockResolvedValue(undefined),
    },
    pageRepo: {
      findById: jest.fn().mockResolvedValue({
        id: 'page_1',
        spaceId: 'space_1',
        workspaceId: 'ws_1',
        title: 'Source page',
        icon: '🔥',
        content,
      }),
    },
    spaceMemberRepo: {
      getUserSpaceIds: jest
        .fn()
        .mockResolvedValue(opts.userSpaces ?? ['space_1']),
    },
    spaceAbility: {
      createForUser: jest.fn().mockResolvedValue({
        can: jest.fn(() => opts.isSpaceAdmin ?? false),
        cannot: jest.fn(() => !(opts.canCreatePage ?? true)),
      }),
    },
    pageAccessService: {
      validateCanView: jest.fn().mockResolvedValue(undefined),
      validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
    },
    pageService: {
      create: jest.fn().mockResolvedValue({
        id: 'new_page',
        spaceId: 'space_1',
        title: 'Runbook',
      }),
    },
    auditService: { log: jest.fn() },
    templateAttachments: {
      // pass content through untouched unless a test overrides it
      prepareClone: jest.fn(async (c) => ({ content: c, copies: [] })),
      commitClone: jest.fn().mockResolvedValue(undefined),
      deleteTemplateFiles: jest.fn().mockResolvedValue(undefined),
    },
  };
  // the real access rules, on top of the mocked repos
  const templateAccess = new TemplateAccessService(
    deps.templateRepo as any,
    deps.spaceMemberRepo as any,
    deps.spaceAbility as any,
  );
  const service = new TemplateService(
    deps.templateRepo as any,
    deps.pageRepo as any,
    deps.spaceMemberRepo as any,
    templateAccess,
    deps.templateAttachments as any,
    deps.pageAccessService as any,
    deps.pageService as any,
    deps.auditService as any,
  );
  return { service, deps };
}

describe('TemplateService attachments', () => {
  const copies = [{ source: { id: 'att_old' }, newId: 'att_new' }];
  const cloned = { type: 'doc', content: [{ type: 'image' }] };

  it('save as template clones the page files into the template', async () => {
    const { service, deps } = createService();
    deps.templateAttachments.prepareClone.mockResolvedValue({
      content: cloned,
      copies,
    });

    await service.create(
      { spaceId: 'space_1', sourcePageId: 'page_1' },
      member,
      workspace,
    );

    expect(deps.templateAttachments.prepareClone).toHaveBeenCalledWith(
      content,
      { pageId: 'page_1' },
      'ws_1',
    );
    expect(deps.templateRepo.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ content: cloned }),
    );
    expect(deps.templateAttachments.commitClone).toHaveBeenCalledWith(
      copies,
      { templateId: 'tpl_new' },
      'space_1',
    );
  });

  it('using a template clones its files into the new page', async () => {
    const { service, deps } = createService();
    deps.templateAttachments.prepareClone.mockResolvedValue({
      content: cloned,
      copies,
    });

    await service.use(
      { templateId: 'tpl_1', spaceId: 'space_1' },
      member,
      workspace,
    );

    expect(deps.templateAttachments.prepareClone).toHaveBeenCalledWith(
      content,
      { templateId: 'tpl_1' },
      'ws_1',
    );
    expect(deps.pageService.create).toHaveBeenCalledWith(
      'member_1',
      'ws_1',
      expect.objectContaining({ content: cloned, format: 'json' }),
    );
    expect(deps.templateAttachments.commitClone).toHaveBeenCalledWith(
      copies,
      { pageId: 'new_page' },
      'space_1',
    );
  });

  it('deleting a template removes its stored files', async () => {
    const { service, deps } = createService({
      template: template({ creatorId: 'member_1' }),
    });

    await service.remove('tpl_1', member, workspace);

    expect(deps.templateAttachments.deleteTemplateFiles).toHaveBeenCalledWith(
      'tpl_1',
    );
    expect(deps.templateRepo.deleteTemplate).toHaveBeenCalled();
  });
});

describe('TemplateService create', () => {
  it('only workspace admins can create global templates', async () => {
    const { service, deps } = createService();

    await expect(
      service.create({ title: 'x', spaceId: null }, member, workspace),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.templateRepo.insertTemplate).not.toHaveBeenCalled();

    await service.create({ title: 'x' }, admin, workspace);
    expect(deps.templateRepo.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: null, creatorId: 'admin_1' }),
    );
  });

  it('space templates need permission to create pages in the space', async () => {
    const { service, deps } = createService({ canCreatePage: false });

    await expect(
      service.create({ title: 'x', spaceId: 'space_1' }, member, workspace),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.templateRepo.insertTemplate).not.toHaveBeenCalled();
  });

  it('stores text content for search', async () => {
    const { service, deps } = createService();

    await service.create({ spaceId: 'space_1', content }, member, workspace);

    expect(deps.templateRepo.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ content, textContent: 'plain text' }),
    );
  });

  it('save as template copies the source page', async () => {
    const { service, deps } = createService();

    await service.create(
      { spaceId: 'space_1', sourcePageId: 'page_1' },
      member,
      workspace,
    );

    expect(deps.pageAccessService.validateCanView).toHaveBeenCalled();
    expect(deps.templateRepo.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Source page', icon: '🔥', content }),
    );
  });

  it('save as template requires view access to the source page', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanView.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.create(
        { spaceId: 'space_1', sourcePageId: 'page_1' },
        member,
        workspace,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.templateRepo.insertTemplate).not.toHaveBeenCalled();
  });
});

describe('TemplateService manage', () => {
  it('the creator can update their template', async () => {
    const { service, deps } = createService({
      template: template({ creatorId: 'member_1' }),
    });

    await service.update(
      { templateId: 'tpl_1', title: 'Renamed' },
      member,
      workspace,
    );

    expect(deps.templateRepo.updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Renamed',
        lastUpdatedById: 'member_1',
      }),
      'tpl_1',
      'ws_1',
    );
  });

  it("other members cannot update or delete someone else's template", async () => {
    const { service, deps } = createService();

    await expect(
      service.update({ templateId: 'tpl_1', title: 'x' }, member, workspace),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remove('tpl_1', member, workspace)).rejects.toThrow(
      ForbiddenException,
    );
    expect(deps.templateRepo.updateTemplate).not.toHaveBeenCalled();
    expect(deps.templateRepo.deleteTemplate).not.toHaveBeenCalled();
  });

  it('space admins can manage space templates', async () => {
    const { service, deps } = createService({ isSpaceAdmin: true });

    await service.remove('tpl_1', member, workspace);

    expect(deps.templateRepo.deleteTemplate).toHaveBeenCalledWith(
      'tpl_1',
      'ws_1',
    );
  });

  it('moving a template to global requires workspace admin', async () => {
    const { service, deps } = createService({
      template: template({ creatorId: 'member_1' }),
    });

    await expect(
      service.update({ templateId: 'tpl_1', spaceId: null }, member, workspace),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.templateRepo.updateTemplate).not.toHaveBeenCalled();
  });

  it('hides space templates from non-members', async () => {
    const { service } = createService({ userSpaces: [] });

    await expect(service.getInfo('tpl_1', member, workspace)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('TemplateService with member templates off', () => {
  it('stops members from creating, even in their own space', async () => {
    const { service, deps } = createService();

    await expect(
      service.create({ title: 'x', spaceId: 'space_1' }, member, adminsOnly),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.templateRepo.insertTemplate).not.toHaveBeenCalled();
  });

  it('stops creators from managing their own templates', async () => {
    const { service, deps } = createService({
      template: template({ creatorId: 'member_1' }),
    });

    await expect(
      service.remove('tpl_1', member, adminsOnly),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.templateRepo.deleteTemplate).not.toHaveBeenCalled();
  });

  it('reports the template as not manageable', async () => {
    const { service } = createService({
      template: template({ creatorId: 'member_1' }),
    });

    const info = await service.getInfo('tpl_1', member, adminsOnly);

    expect(info.permissions.canManage).toBe(false);
  });

  it('leaves admins alone', async () => {
    const { service, deps } = createService();

    await service.create({ title: 'x' }, admin, adminsOnly);

    expect(deps.templateRepo.insertTemplate).toHaveBeenCalled();
  });

  it('still lets members use a template', async () => {
    const { service, deps } = createService({
      template: template({ spaceId: 'space_1' }),
    });

    await service.use({ templateId: 'tpl_1', spaceId: 'space_1' } as any, member, adminsOnly);

    expect(deps.pageService.create).toHaveBeenCalled();
  });
});

describe('TemplateService use', () => {
  it('creates a page from the template content', async () => {
    const { service, deps } = createService();

    await service.use(
      { templateId: 'tpl_1', spaceId: 'space_1' },
      member,
      workspace,
    );

    expect(deps.pageService.create).toHaveBeenCalledWith('member_1', 'ws_1', {
      title: 'Runbook',
      icon: '📘',
      spaceId: 'space_1',
      parentPageId: undefined,
      content,
      format: 'json',
    });
  });

  it('requires permission to create pages at the destination', async () => {
    const { service, deps } = createService({ canCreatePage: false });

    await expect(
      service.use(
        { templateId: 'tpl_1', spaceId: 'space_1' },
        member,
        workspace,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.create).not.toHaveBeenCalled();
  });

  it('requires edit access to the parent page', async () => {
    const { service, deps } = createService();
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.use(
        { templateId: 'tpl_1', spaceId: 'space_1', parentPageId: 'page_1' },
        member,
        workspace,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.pageService.create).not.toHaveBeenCalled();
  });

  it('cannot use a space template from a space the user cannot access', async () => {
    const { service, deps } = createService({ userSpaces: ['space_2'] });

    await expect(
      service.use(
        { templateId: 'tpl_1', spaceId: 'space_2' },
        member,
        workspace,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(deps.pageService.create).not.toHaveBeenCalled();
  });
});
