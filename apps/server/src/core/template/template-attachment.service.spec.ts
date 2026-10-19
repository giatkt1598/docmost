import { TemplateAttachmentService } from './template-attachment.service';

const ATT_OWNED = '01a15550-0000-7000-8000-000000000001';
const ATT_FOREIGN = '01a15550-0000-7000-8000-000000000002';

const content = {
  type: 'doc',
  content: [
    {
      type: 'image',
      attrs: {
        attachmentId: ATT_OWNED,
        src: `/api/files/${ATT_OWNED}/photo.png`,
      },
    },
    {
      type: 'attachment',
      attrs: {
        attachmentId: ATT_FOREIGN,
        url: `/api/files/${ATT_FOREIGN}/doc.pdf`,
      },
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
  ],
};

const ownedRow = {
  id: ATT_OWNED,
  type: 'file',
  filePath: `ws_1/files/${ATT_OWNED}/photo.png`,
  fileName: 'photo.png',
  fileSize: 10,
  mimeType: 'image/png',
  fileExt: '.png',
  creatorId: 'user_1',
  workspaceId: 'ws_1',
  pageId: 'page_1',
};

function createService(ownedRows: any[] = [ownedRow]) {
  const query = {
    selectAll: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(ownedRows),
  };
  const db = { selectFrom: jest.fn(() => query) };
  const attachmentRepo = { insertAttachment: jest.fn().mockResolvedValue({}) };
  const storageService = {
    copy: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TemplateAttachmentService(
    db as any,
    attachmentRepo as any,
    storageService as any,
  );
  return { service, query, attachmentRepo, storageService };
}

jest.mock('../../common/helpers/prosemirror/utils', () => ({
  getAttachmentIds: jest.fn(() => [ATT_OWNED, ATT_FOREIGN]),
  isAttachmentNode: (type: string) =>
    [
      'image',
      'attachment',
      'video',
      'pdf',
      'audio',
      'drawio',
      'excalidraw',
    ].includes(type),
}));

describe('TemplateAttachmentService.prepareClone', () => {
  it('re-ids only the files owned by the source', async () => {
    const { service, query } = createService();

    const { content: cloned, copies } = await service.prepareClone(
      content,
      { pageId: 'page_1' },
      'ws_1',
    );

    expect(query.where).toHaveBeenCalledWith('pageId', '=', 'page_1');
    expect(copies).toHaveLength(1);
    const { newId } = copies[0];
    expect(newId).not.toBe(ATT_OWNED);

    const image = cloned.content[0];
    expect(image.attrs.attachmentId).toBe(newId);
    expect(image.attrs.src).toBe(`/api/files/${newId}/photo.png`);

    // a file the source does not own is left alone
    expect(cloned.content[1].attrs.attachmentId).toBe(ATT_FOREIGN);
    // the original content is not mutated
    expect(content.content[0].attrs.attachmentId).toBe(ATT_OWNED);
  });

  it('filters by template when cloning from a template', async () => {
    const { service, query } = createService();

    await service.prepareClone(content, { templateId: 'tpl_1' }, 'ws_1');

    expect(query.where).toHaveBeenCalledWith('templateId', '=', 'tpl_1');
  });

  it('returns the content unchanged when nothing is owned', async () => {
    const { service } = createService([]);

    const result = await service.prepareClone(
      content,
      { pageId: 'page_1' },
      'ws_1',
    );

    expect(result).toEqual({ content, copies: [] });
  });
});

describe('TemplateAttachmentService.commitClone', () => {
  it('copies the file and records it for the new owner', async () => {
    const { service, attachmentRepo, storageService } = createService();

    await service.commitClone(
      [{ source: ownedRow as any, newId: 'att_new' }],
      { templateId: 'tpl_1' },
      null,
    );

    expect(storageService.copy).toHaveBeenCalledWith(
      ownedRow.filePath,
      'ws_1/files/att_new/photo.png',
    );
    expect(attachmentRepo.insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'att_new',
        filePath: 'ws_1/files/att_new/photo.png',
        templateId: 'tpl_1',
        pageId: null,
        spaceId: null,
      }),
    );
  });

  it('keeps going when one file fails to copy', async () => {
    const { service, attachmentRepo, storageService } = createService();
    storageService.copy
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce(undefined);

    await service.commitClone(
      [
        { source: ownedRow as any, newId: 'a1' },
        {
          source: {
            ...ownedRow,
            id: 'b',
            filePath: 'ws_1/files/b/x.png',
          } as any,
          newId: 'b1',
        },
      ],
      { pageId: 'page_2' },
      'space_1',
    );

    expect(attachmentRepo.insertAttachment).toHaveBeenCalledTimes(1);
    expect(attachmentRepo.insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'b1',
        pageId: 'page_2',
        spaceId: 'space_1',
      }),
    );
  });
});

describe('TemplateAttachmentService.deleteTemplateFiles', () => {
  it('deletes every stored file of the template', async () => {
    const { service, storageService } = createService([
      { id: 'a', filePath: 'p/a' },
      { id: 'b', filePath: 'p/b' },
    ]);

    await service.deleteTemplateFiles('tpl_1');

    expect(storageService.delete).toHaveBeenCalledWith('p/a');
    expect(storageService.delete).toHaveBeenCalledWith('p/b');
  });
});
