import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ImportToolsService } from './import-tools.service';
import { RemoteFileError } from '../media-localize/remote-file-fetcher.service';

// the real service pulls in ESM-only import formatters
jest.mock('../../integrations/import/services/import.service', () => ({
  ImportService: class {},
}));

const actor = {
  user: { id: 'user_1' },
  workspace: { id: 'ws_1' },
} as any;
const SPACE = '01a170d1-75ba-7e62-93f4-776bdfac5814';
const page = { id: 'page_1', slugId: 'abc', title: 'Hello', spaceId: SPACE };

function createService(opts: { canEdit?: boolean } = {}) {
  const deps = {
    importService: {
      importPageFile: jest.fn().mockResolvedValue(page),
      importWebPage: jest.fn().mockResolvedValue(page),
      importZipFile: jest
        .fn()
        .mockResolvedValue({ id: 'task_1', status: 'processing' }),
      findFileTask: jest.fn(),
      resolveParentPage: jest.fn().mockResolvedValue('parent_1'),
    },
    fetcher: { fetch: jest.fn() },
    spaceAbility: {
      createForUser: jest.fn(async () => ({
        cannot: jest.fn(() => !(opts.canEdit ?? true)),
      })),
    },
    environmentService: { getFileImportSizeLimit: () => '200mb' },
    auditService: { log: jest.fn() },
  };
  const service = new ImportToolsService(
    deps.importService as any,
    deps.fetcher as any,
    deps.spaceAbility as any,
    deps.environmentService as any,
    deps.auditService as any,
  );
  return { service, deps };
}

const b64 = (text: string) => Buffer.from(text).toString('base64');

describe('ImportToolsService', () => {
  it('imports a base64 file by its extension', async () => {
    const { service, deps } = createService();

    const result = await service.importPage(actor, {
      space_id: SPACE,
      file_base64: b64('# Hi'),
      file_name: 'notes.md',
    });

    expect(deps.importService.importPageFile).toHaveBeenCalledWith(
      Buffer.from('# Hi'),
      'notes.md',
      'user_1',
      SPACE,
      'ws_1',
      undefined,
    );
    expect(result).toEqual({
      page_id: 'page_1',
      slug_id: 'abc',
      title: 'Hello',
      space_id: SPACE,
      parent_page_id: undefined,
    });
    expect(deps.auditService.log).toHaveBeenCalled();
  });

  it('imports under a parent page it resolved', async () => {
    const { service, deps } = createService();

    await service.importPage(actor, {
      space_id: SPACE,
      parent_page_id: 'https://docs.example.com/s/x/p/guide-abc123',
      file_base64: b64('# Hi'),
      file_name: 'notes.md',
    });
    await service.importZip(actor, {
      space_id: SPACE,
      parent_page_id: 'abc123',
      source: 'generic',
      file_base64: b64('PK'),
      file_name: 'pages.zip',
    });

    expect(deps.importService.resolveParentPage).toHaveBeenCalledWith(
      'https://docs.example.com/s/x/p/guide-abc123',
      SPACE,
      actor.user,
    );
    expect(deps.importService.importPageFile.mock.calls[0][5]).toBe('parent_1');
    expect(deps.importService.importZipFile.mock.calls[0][6]).toBe('parent_1');
  });

  it('does not import when the parent page is refused', async () => {
    const { service, deps } = createService();
    deps.importService.resolveParentPage.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.importPage(actor, {
        space_id: SPACE,
        parent_page_id: 'abc123',
        web_url: 'https://example.com/a',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.importService.importWebPage).not.toHaveBeenCalled();
  });

  it('imports a web page', async () => {
    const { service, deps } = createService();

    await service.importPage(actor, {
      space_id: SPACE,
      web_url: 'https://example.com/a',
      web_mode: 'full',
    });

    expect(deps.importService.importWebPage).toHaveBeenCalledWith(
      'https://example.com/a',
      'full',
      'user_1',
      SPACE,
      'ws_1',
      undefined,
    );
  });

  it('downloads file_url and lets file_name pick the format', async () => {
    const { service, deps } = createService();
    deps.fetcher.fetch.mockResolvedValue({
      buffer: Buffer.from('<p>x</p>'),
      fileName: 'download',
    });

    await service.importPage(actor, {
      space_id: SPACE,
      file_url: 'https://example.com/export',
      file_name: 'page.html',
    });

    expect(deps.importService.importPageFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'page.html',
      'user_1',
      SPACE,
      'ws_1',
      undefined,
    );
  });

  it('reports download failures as bad requests', async () => {
    const { service, deps } = createService();
    deps.fetcher.fetch.mockRejectedValue(new RemoteFileError('HTTP 404'));

    await expect(
      service.importPage(actor, {
        space_id: SPACE,
        file_url: 'https://example.com/a.md',
      }),
    ).rejects.toThrow('Download failed: HTTP 404');
  });

  it('needs exactly one source', async () => {
    const { service } = createService();

    await expect(
      service.importPage(actor, { space_id: SPACE }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.importPage(actor, {
        space_id: SPACE,
        web_url: 'https://example.com',
        file_base64: b64('x'),
        file_name: 'a.md',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses unsupported file types', async () => {
    const { service, deps } = createService();

    await expect(
      service.importPage(actor, {
        space_id: SPACE,
        file_base64: b64('x'),
        file_name: 'a.exe',
      }),
    ).rejects.toThrow('Unsupported file type ".exe"');
    expect(deps.importService.importPageFile).not.toHaveBeenCalled();
  });

  it('requires edit access to the space', async () => {
    const { service, deps } = createService({ canEdit: false });

    await expect(
      service.importPage(actor, {
        space_id: SPACE,
        file_base64: b64('x'),
        file_name: 'a.md',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.importZip(actor, {
        space_id: SPACE,
        source: 'notion',
        file_base64: b64('x'),
        file_name: 'a.zip',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.importService.importZipFile).not.toHaveBeenCalled();
  });

  it('queues a zip import and returns the task', async () => {
    const { service, deps } = createService();

    const result = await service.importZip(actor, {
      space_id: SPACE,
      source: 'confluence',
      file_base64: b64('PK'),
      file_name: 'space.zip',
    });

    expect(deps.importService.importZipFile).toHaveBeenCalledWith(
      Buffer.from('PK'),
      'space.zip',
      'confluence',
      'user_1',
      SPACE,
      'ws_1',
      undefined,
    );
    expect(result).toEqual({ task_id: 'task_1', status: 'processing' });
  });

  it('refuses a zip import of a non-zip file', async () => {
    const { service } = createService();

    await expect(
      service.importZip(actor, {
        space_id: SPACE,
        source: 'generic',
        file_base64: b64('x'),
        file_name: 'a.md',
      }),
    ).rejects.toThrow('The file must be a .zip');
  });

  it('hides import tasks of other workspaces', async () => {
    const { service, deps } = createService();
    deps.importService.findFileTask.mockResolvedValue({
      id: 'task_1',
      spaceId: SPACE,
      workspaceId: 'ws_other',
    });

    await expect(
      service.getImportTask(actor, { task_id: 'task_1' }),
    ).rejects.toThrow('Import task not found');
  });

  it('returns the import task status', async () => {
    const { service, deps } = createService();
    deps.importService.findFileTask.mockResolvedValue({
      id: 'task_1',
      spaceId: SPACE,
      workspaceId: 'ws_1',
      status: 'failed',
      errorMessage: 'bad zip',
      fileName: 'a.zip',
      source: 'generic',
    });

    const result = await service.getImportTask(actor, { task_id: 'task_1' });
    expect(result).toMatchObject({
      status: 'failed',
      error_message: 'bad zip',
    });
  });
});
