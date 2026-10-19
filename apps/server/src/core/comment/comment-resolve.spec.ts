import { BadRequestException } from '@nestjs/common';
import { CommentService } from './comment.service';
import { QueueJob } from '../../integrations/queue/constants';

const author = { id: 'author_1' } as any;
const otherUser = { id: 'user_2' } as any;

function baseComment(overrides: Record<string, any> = {}) {
  return {
    id: 'comment_1',
    pageId: 'page_1',
    spaceId: 'space_1',
    workspaceId: 'ws_1',
    creatorId: author.id,
    parentCommentId: null,
    resolvedAt: null,
    resolvedById: null,
    ...overrides,
  } as any;
}

function createService() {
  const deps = {
    commentRepo: {
      updateComment: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(async (id: string) => ({ id, refreshed: true })),
    },
    pageRepo: {},
    wsService: { emitCommentEvent: jest.fn() },
    collaborationGateway: {
      handleYjsEvent: jest.fn().mockResolvedValue(undefined),
    },
    generalQueue: { add: jest.fn().mockResolvedValue(undefined) },
    notificationQueue: { add: jest.fn().mockResolvedValue(undefined) },
  };
  const service = new CommentService(
    deps.commentRepo as any,
    deps.pageRepo as any,
    deps.wsService as any,
    deps.collaborationGateway as any,
    deps.generalQueue as any,
    deps.notificationQueue as any,
  );
  return { service, deps };
}

describe('CommentService.setResolved', () => {
  it('resolves a comment, updates the mark and broadcasts it', async () => {
    const { service, deps } = createService();

    const result = await service.setResolved(baseComment(), true, otherUser);

    const [update, commentId] = deps.commentRepo.updateComment.mock.calls[0];
    expect(commentId).toBe('comment_1');
    expect(update.resolvedAt).toBeInstanceOf(Date);
    expect(update.resolvedById).toBe('user_2');

    expect(deps.collaborationGateway.handleYjsEvent).toHaveBeenCalledWith(
      'resolveCommentMark',
      'page.page_1',
      { commentId: 'comment_1', resolved: true, user: otherUser },
    );
    expect(deps.wsService.emitCommentEvent).toHaveBeenCalledWith(
      'space_1',
      'page_1',
      {
        operation: 'commentResolved',
        pageId: 'page_1',
        comment: { id: 'comment_1', refreshed: true },
      },
    );
    expect(result).toEqual({ id: 'comment_1', refreshed: true });
  });

  it('notifies the author when someone else resolves their comment', async () => {
    const { service, deps } = createService();

    await service.setResolved(baseComment(), true, otherUser);

    expect(deps.notificationQueue.add).toHaveBeenCalledWith(
      QueueJob.COMMENT_RESOLVED_NOTIFICATION,
      {
        commentId: 'comment_1',
        commentCreatorId: 'author_1',
        pageId: 'page_1',
        spaceId: 'space_1',
        workspaceId: 'ws_1',
        actorId: 'user_2',
      },
    );
  });

  it('does not notify the author when they resolve their own comment', async () => {
    const { service, deps } = createService();

    await service.setResolved(baseComment(), true, author);

    expect(deps.notificationQueue.add).not.toHaveBeenCalled();
  });

  it('re-opens a comment by clearing the resolved fields', async () => {
    const { service, deps } = createService();
    const comment = baseComment({
      resolvedAt: new Date(),
      resolvedById: 'user_2',
    });

    await service.setResolved(comment, false, otherUser);

    const [update] = deps.commentRepo.updateComment.mock.calls[0];
    expect(update.resolvedAt).toBeNull();
    expect(update.resolvedById).toBeNull();
    expect(deps.notificationQueue.add).not.toHaveBeenCalled();
    expect(deps.collaborationGateway.handleYjsEvent).toHaveBeenCalledWith(
      'resolveCommentMark',
      'page.page_1',
      expect.objectContaining({ resolved: false }),
    );
  });

  it('rejects resolving a reply', async () => {
    const { service, deps } = createService();

    await expect(
      service.setResolved(
        baseComment({ parentCommentId: 'parent_1' }),
        true,
        author,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(deps.commentRepo.updateComment).not.toHaveBeenCalled();
  });

  it('is a no-op when the state does not change', async () => {
    const { service, deps } = createService();
    const comment = baseComment({ resolvedAt: new Date() });

    const result = await service.setResolved(comment, true, author);

    expect(result).toBe(comment);
    expect(deps.commentRepo.updateComment).not.toHaveBeenCalled();
    expect(deps.wsService.emitCommentEvent).not.toHaveBeenCalled();
  });

  it('still saves the state when the collaboration update fails', async () => {
    const { service, deps } = createService();
    deps.collaborationGateway.handleYjsEvent.mockRejectedValue(
      new Error('collab down'),
    );

    await service.setResolved(baseComment(), true, author);

    expect(deps.commentRepo.updateComment).toHaveBeenCalled();
    expect(deps.wsService.emitCommentEvent).toHaveBeenCalled();
  });
});
