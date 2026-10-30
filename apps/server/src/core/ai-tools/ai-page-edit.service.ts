import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { isDeepStrictEqual } from 'node:util';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { Page, User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AttachmentRef,
  BlockInput,
  DocBlock,
  toDocBlock,
} from './blocks/doc-blocks';
import { PmNode } from './blocks/rich-text';
import { Operation } from './operations/engine';
import { expandMarkdown } from './page-schema';

export const LIMITS = {
  operations: 50,
  newBlocks: 100,
  textChars: 20_000,
  depth: 4,
};

export type ToolError = {
  code: 'CONFLICT' | 'VALIDATION' | 'NOT_FOUND' | 'LIMIT' | 'INTERNAL';
  message: string;
  details?: { op_index?: number; block_id?: string; reason: string }[];
};

export type ApplyOutcome =
  | {
      ok: true;
      edit_id: string;
      changed: DocBlock[];
      deleted_ids: string[];
    }
  | { ok: false; error: ToolError };

const documentName = (pageId: string) => `page.${pageId}`;

// postgres.js would encode an already serialised value twice
const jsonb = (value: unknown) =>
  sql<any>`${JSON.stringify(value)}::text::jsonb`;
const PENDING_TIMEOUT_MS = 10 * 60 * 1000;

// Counts what a batch adds, for the limits.
function measure(blocks: BlockInput[], depth = 1) {
  let count = 0;
  let chars = 0;
  let deepest = depth;
  for (const b of blocks) {
    count++;
    chars += (b.text?.length ?? 0) + (b.markdown?.length ?? 0);
    chars += JSON.stringify(b.rich_text ?? b.rows ?? '').length;
    for (const item of b.items ?? []) {
      if (typeof item === 'string') chars += item.length;
      else if (Array.isArray(item)) chars += JSON.stringify(item).length;
    }
    const nested = [
      ...(b.children ?? []),
      ...((b.items ?? []).filter(
        (i) => i && typeof i === 'object' && !Array.isArray(i),
      ) as BlockInput[]),
    ];
    if (nested.length) {
      const inner = measure(nested, depth + 1);
      count += inner.count;
      chars += inner.chars;
      deepest = Math.max(deepest, inner.deepest);
    }
  }
  return { count, chars, deepest };
}

export function checkLimits(operations: Operation[]): ToolError | null {
  if (operations.length === 0) {
    return { code: 'VALIDATION', message: 'No operations given' };
  }
  if (operations.length > LIMITS.operations) {
    return {
      code: 'LIMIT',
      message: `At most ${LIMITS.operations} operations per call; split the work`,
    };
  }
  let count = 0;
  let chars = 0;
  for (const op of operations) {
    if (op.op === 'insert') {
      const m = measure(op.blocks);
      count += m.count;
      chars += m.chars;
      if (m.deepest > LIMITS.depth) {
        return {
          code: 'LIMIT',
          message: `Blocks may nest at most ${LIMITS.depth} levels deep`,
        };
      }
    } else if (op.op === 'update') {
      chars += JSON.stringify(op.patch ?? {}).length;
    }
  }
  if (count > LIMITS.newBlocks) {
    return {
      code: 'LIMIT',
      message: `At most ${LIMITS.newBlocks} new blocks per call; split the work`,
    };
  }
  if (chars > LIMITS.textChars * 2) {
    return {
      code: 'LIMIT',
      message: `At most about ${LIMITS.textChars} characters of text per call; split the work`,
    };
  }
  return null;
}

function findNode(root: PmNode, id: string): PmNode | null {
  for (const child of root.content ?? []) {
    if (child.attrs?.id === id && child.type !== 'text') return child;
    const inner = findNode(child, id);
    if (inner) return inner;
  }
  return null;
}

// Reads and edits pages for the AI tools, records every edit so it can be
// undone, and writes page history that names the AI edit. Permission checks
// are the caller's job (McpService / controller).
@Injectable()
export class AiPageEditService implements OnModuleInit {
  private readonly logger = new Logger(AiPageEditService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly collaboration: CollaborationGateway,
    private readonly pageRepo: PageRepo,
    private readonly pageHistoryRepo: PageHistoryRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  // Edits left pending by a crash are not undoable.
  async onModuleInit() {
    await this.db
      .updateTable('aiPageEdits')
      .set({
        status: 'failed',
        error: 'Interrupted before it was recorded',
        updatedAt: new Date(),
      })
      .where('status', '=', 'pending')
      .where('createdAt', '<', new Date(Date.now() - PENDING_TIMEOUT_MS))
      .execute()
      .catch((err) => this.logger.warn(`Pending edit sweep failed: ${err}`));
  }

  async readPage(pageId: string, user: User): Promise<PmNode> {
    const result = await this.collaboration.handleYjsEvent(
      'aiReadPage',
      documentName(pageId),
      { user },
    );
    if (!result || result.ok === false) {
      throw new Error(result?.message ?? 'The page could not be read');
    }
    return result.doc;
  }

  async apply(
    page: Page,
    user: User,
    opts: {
      summary: string;
      operations: Operation[];
      aiChatId?: string | null;
      undoOf?: string;
      attachments?: Map<string, AttachmentRef>;
      trustedInline?: PmNode[];
    },
  ): Promise<ApplyOutcome> {
    const undo = !!opts.undoOf;
    if (!undo) {
      const limit = checkLimits(opts.operations);
      if (limit) return { ok: false, error: limit };
    }

    const markdown = await expandMarkdown(
      opts.operations.flatMap((op) => (op.op === 'insert' ? op.blocks : [])),
    );

    const edit = await this.db
      .insertInto('aiPageEdits')
      .values({
        pageId: page.id,
        workspaceId: page.workspaceId,
        userId: user.id,
        aiChatId: opts.aiChatId ?? null,
        summary: opts.summary,
        operations: jsonb(opts.operations),
        status: 'pending',
        undoOf: opts.undoOf ?? null,
      })
      .returning('id')
      .executeTakeFirst();

    let result: any;
    try {
      result = await this.collaboration.handleYjsEvent(
        'aiApplyOperations',
        documentName(page.id),
        {
          user,
          operations: opts.operations,
          markdown: [...markdown.entries()],
          attachments: [...(opts.attachments ?? new Map()).entries()],
          trustedInline: opts.trustedInline ?? [],
          mode: undo ? 'undo' : 'edit',
        },
      );
    } catch (err) {
      result = { ok: false, code: 'INTERNAL', message: (err as Error).message };
    }

    if (!result || result.ok === false) {
      await this.markFailed(edit.id, result?.message ?? 'Unknown error');
      return {
        ok: false,
        error: {
          code: result?.code ?? 'INTERNAL',
          message: result?.message ?? 'The edit failed',
          ...(result?.details && { details: result.details }),
        },
      };
    }

    const affected = {
      changed: result.changedIds.map((id: string) => ({
        id,
        rev: result.liveRevs[id],
      })),
      deleted: result.deletedIds,
    };

    try {
      await this.recordApplied({
        editId: edit.id,
        page,
        user,
        before: result.before,
        after: result.doc,
        inverse: result.inverse,
        affected,
        source: undo ? 'undo' : 'ai',
      });
    } catch (err) {
      // the page changed but the record did not: it stays pending and the
      // regular history snapshot still captures the content
      this.logger.error(`Recording AI edit ${edit.id} failed`, err);
    }

    this.auditService.log({
      event: undo ? AuditEvent.PAGE_AI_EDIT_UNDONE : AuditEvent.PAGE_AI_EDITED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        editId: edit.id,
        ...(opts.undoOf && { undoOf: opts.undoOf }),
        summary: opts.summary,
        changedBlocks: result.changedIds.length,
        deletedBlocks: result.deletedIds.length,
      },
    });

    const changed = result.changedIds
      .map((id: string) => findNode(result.doc, id))
      .filter(Boolean)
      .map((node: PmNode) => toDocBlock(node, 1));

    return {
      ok: true,
      edit_id: edit.id,
      changed,
      deleted_ids: result.deletedIds,
    };
  }

  async pageOfEdit(
    editId: string,
    workspaceId: string,
  ): Promise<string | null> {
    const edit = await this.db
      .selectFrom('aiPageEdits')
      .select('pageId')
      .where('id', '=', editId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return edit?.pageId ?? null;
  }

  // Undoes one AI edit, only where nobody changed its blocks since.
  async undo(
    editId: string,
    user: User,
    workspaceId: string,
  ): Promise<ApplyOutcome & { page?: Page }> {
    const edit = await this.db
      .selectFrom('aiPageEdits')
      .selectAll()
      .where('id', '=', editId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    if (!edit) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Edit not found' },
      };
    }
    if (edit.status !== 'applied' || !edit.inverse) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message:
            edit.status === 'undone'
              ? 'This edit was already undone'
              : 'This edit cannot be undone',
        },
      };
    }
    const page = await this.pageRepo.findById(edit.pageId);
    if (!page || page.deletedAt) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Page not found' },
      };
    }

    const outcome = await this.apply(page, user, {
      summary: `Undo: ${edit.summary ?? ''}`.trim(),
      operations: await this.inverseOf(edit.id),
      aiChatId: edit.aiChatId,
      undoOf: edit.id,
    });
    if (outcome.ok === false) {
      const blocks = (outcome.error.details ?? [])
        .map((d) => d.block_id)
        .filter(Boolean);
      return {
        ok: false,
        error: {
          code: 'CONFLICT',
          message:
            'The blocks this AI edit changed were edited afterwards, so undoing it would overwrite that work.' +
            (blocks.length ? ` Changed blocks: ${blocks.join(', ')}` : ''),
          details: outcome.error.details,
        },
      };
    }
    await this.db
      .updateTable('aiPageEdits')
      .set({ status: 'undone', updatedAt: new Date() })
      .where('id', '=', edit.id)
      .execute();
    return { ...outcome, page };
  }

  // Read without the camelCase plugin: it would rename the snake_case keys
  // inside the stored operations (block_id, parent_id...).
  private async inverseOf(editId: string): Promise<Operation[]> {
    const row = await (this.db.withoutPlugins() as any)
      .selectFrom('ai_page_edits')
      .select('inverse')
      .where('id', '=', editId)
      .executeTakeFirst();
    return (row?.inverse ?? []) as Operation[];
  }

  private async markFailed(editId: string, error: string) {
    await this.db
      .updateTable('aiPageEdits')
      .set({ status: 'failed', error, updatedAt: new Date() })
      .where('id', '=', editId)
      .execute()
      .catch(() => undefined);
  }

  // One transaction: the edit is applied and its history exists, or neither
  // is recorded.
  private async recordApplied(opts: {
    editId: string;
    page: Page;
    user: User;
    before: PmNode;
    after: PmNode;
    inverse: Operation[];
    affected: { changed: { id: string; rev: string }[]; deleted: string[] };
    source: 'ai' | 'undo';
  }) {
    const { page, user } = opts;
    const fresh = (await this.pageRepo.findById(page.id)) ?? page;
    const meta = {
      pageId: page.id,
      slugId: fresh.slugId,
      title: fresh.title,
      icon: fresh.icon,
      coverPhoto: fresh.coverPhoto,
      spaceId: fresh.spaceId,
      workspaceId: fresh.workspaceId,
    };

    // the two versions must sort before/after each other
    const now = Date.now();
    await executeTx(this.db, async (trx) => {
      await trx
        .updateTable('aiPageEdits')
        .set({
          status: 'applied',
          inverse: jsonb(opts.inverse),
          affected: jsonb(opts.affected),
          updatedAt: new Date(),
        })
        .where('id', '=', opts.editId)
        .execute();

      // keep the human work since the last snapshot as its own version
      const last = await this.pageHistoryRepo.findPageLastHistory(page.id, {
        includeContent: true,
        trx,
      });
      if (!last || !isDeepStrictEqual(last.content, opts.before)) {
        await this.pageHistoryRepo.insertPageHistory(
          {
            ...meta,
            content: opts.before as any,
            lastUpdatedById: fresh.lastUpdatedById ?? user.id,
            source: 'user',
            createdAt: new Date(now - 1),
          },
          trx,
        );
      }
      await this.pageHistoryRepo.insertPageHistory(
        {
          ...meta,
          content: opts.after as any,
          lastUpdatedById: user.id,
          contributorIds: [user.id],
          source: opts.source,
          aiEditId: opts.editId,
          createdAt: new Date(now),
        },
        trx,
      );
    });
  }
}
