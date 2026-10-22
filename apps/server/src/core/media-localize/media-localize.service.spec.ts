import { MediaLocalizeService } from './media-localize.service';
import { RemoteFileError } from './remote-file-fetcher.service';

const content = {
  type: 'doc',
  content: [
    { type: 'image', attrs: { src: 'https://e.com/a.png' } },
    { type: 'image', attrs: { src: 'https://e.com/b.png' } },
  ],
};
const page = {
  id: 'page-1',
  spaceId: 'space-1',
  workspaceId: 'ws-1',
  creatorId: 'user-1',
  lastUpdatedById: 'user-1',
  deletedAt: null,
  content,
};

function setup(opts: {
  live?: boolean[];
  counts?: Record<string, number>;
  fetchError?: Error;
}) {
  const live = [...(opts.live ?? [true, true])];
  const redisStore = new Map<string, string>();
  const pageRepo = {
    findById: jest.fn(async (_id: string, o?: any) =>
      o?.includeContent ? page : live.shift() === false ? null : page,
    ),
  };
  let n = 0;
  const attachmentService = {
    saveRemoteFile: jest.fn(async (f: any) => ({
      id: `att-${++n}`,
      fileName: f.fileName,
      fileSize: f.buffer.length,
      mimeType: f.mimeType,
    })),
    deleteAttachment: jest.fn(),
  };
  const gateway = {
    handleYjsEvent: jest.fn(async () => opts.counts ?? {}),
  };
  const fetcher = {
    fetch: jest.fn(async (url: string) => {
      if (opts.fetchError) throw opts.fetchError;
      return {
        buffer: Buffer.from('x'),
        fileName: url.split('/').pop(),
        fileExtension: '.png',
        mimeType: 'image/png',
      };
    }),
  };
  const redis = {
    exists: jest.fn(async (k: string) => (redisStore.has(k) ? 1 : 0)),
    set: jest.fn(async (k: string, v: string) => redisStore.set(k, v)),
  };
  const service = new MediaLocalizeService(
    {} as any,
    { getAppUrl: () => 'http://localhost:3000' } as any,
    pageRepo as any,
    { findById: jest.fn(async () => ({ id: 'user-1' })) } as any,
    attachmentService as any,
    gateway as any,
    fetcher as any,
    { getOrThrow: () => redis } as any,
  );
  return { service, attachmentService, gateway, fetcher, redis };
}

describe('MediaLocalizeService.run', () => {
  it('copies files and keeps the ones the page uses', async () => {
    const { service, attachmentService, gateway } = setup({
      counts: { 'https://e.com/a.png': 1 },
    });
    await service.run('page-1', false);

    expect(attachmentService.saveRemoteFile).toHaveBeenCalledTimes(2);
    expect(attachmentService.saveRemoteFile.mock.calls[0][0]).toMatchObject({
      pageId: 'page-1',
      spaceId: 'space-1',
      workspaceId: 'ws-1',
    });
    expect(gateway.handleYjsEvent).toHaveBeenCalledWith(
      'localizeMedia',
      'page.page-1',
      expect.objectContaining({
        replacements: [
          expect.objectContaining({
            url: 'https://e.com/a.png',
            src: '/api/files/att-1/a.png',
          }),
          expect.objectContaining({ url: 'https://e.com/b.png' }),
        ],
      }),
    );
    // b.png was removed from the page meanwhile
    expect(attachmentService.deleteAttachment).toHaveBeenCalledTimes(1);
    expect(attachmentService.deleteAttachment.mock.calls[0][0].id).toBe(
      'att-2',
    );
  });

  it('deletes the copies when the page is deleted during the download', async () => {
    const { service, attachmentService, gateway } = setup({ live: [false] });
    await service.run('page-1', false);
    expect(gateway.handleYjsEvent).not.toHaveBeenCalled();
    expect(attachmentService.deleteAttachment).toHaveBeenCalledTimes(2);
  });

  it('deletes the copies when the page is deleted during the write', async () => {
    const { service, attachmentService } = setup({
      live: [true, false],
      counts: { 'https://e.com/a.png': 1, 'https://e.com/b.png': 1 },
    });
    await service.run('page-1', false);
    expect(attachmentService.deleteAttachment).toHaveBeenCalledTimes(2);
  });

  it('remembers permanent failures and retries temporary ones', async () => {
    const permanent = setup({ fetchError: new RemoteFileError('HTTP 404') });
    await permanent.service.run('page-1', false);
    expect(permanent.redis.set).toHaveBeenCalledTimes(2);
    // the next run skips them without fetching
    await permanent.service.run('page-1', false);
    expect(permanent.fetcher.fetch).toHaveBeenCalledTimes(2);

    const temporary = setup({
      fetchError: new RemoteFileError('HTTP 503', true),
    });
    await expect(temporary.service.run('page-1', false)).rejects.toThrow(
      /temporary/,
    );
    expect(temporary.redis.set).not.toHaveBeenCalled();
    // last attempt: give up and remember
    await temporary.service.run('page-1', true);
    expect(temporary.redis.set).toHaveBeenCalledTimes(2);
  });

  it('does nothing for a trashed page', async () => {
    const { service, fetcher } = setup({});
    page.deletedAt = new Date() as any;
    try {
      await service.run('page-1', false);
    } finally {
      page.deletedAt = null;
    }
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });
});
