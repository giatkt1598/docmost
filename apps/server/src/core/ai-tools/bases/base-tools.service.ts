import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { z } from 'zod';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { Page } from '@docmost/db/types/entity.types';
import { BaseService } from '../../base/base.service';
import { BaseRowService } from '../../base/base-row.service';
import { BasePropertyService } from '../../base/base-property.service';
import { BASE_PROPERTY_TYPES } from '../../base/engine/base.types';
import { generateBaseChoiceId } from '../../../common/helpers/nanoid.utils';
import { PageAccessService } from '../../page/page-access/page-access.service';
import { ToolActor } from '../ai-page-tools.service';
import { normalizePageRef } from '../page-ref';
import { ToolDefinition } from '../tool-definition';
import {
  CellRefs,
  cellReferences,
  choiceOptions,
  describeProperty,
  filterReferences,
  readRow,
  toCells,
  toFilter,
  toSorts,
  ToolProperty,
} from './base-cells';

const MAX_ROWS = 100;
const BASE_ID = z
  .string()
  .min(1)
  .max(300)
  .describe('The base: its page id, slug id or page URL');
const CELLS = z
  .record(z.string(), z.any())
  .describe(
    'Property name -> value. select/status: a choice name; multiSelect: a list of names; person: email or user id; date: ISO date; checkbox: true/false; null clears',
  );
const FILTER_EXAMPLE =
  '{"op":"and","children":[{"property":"Status","op":"eq","value":"Done"},{"property":"Due","op":"before","value":"2026-11-01"}]}';

// Bases (databases) for the AI tools: properties and choices by name,
// readable rows, the same permission checks as the bases REST API.
@Injectable()
export class BaseToolsService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly bases: BaseService,
    private readonly rows: BaseRowService,
    private readonly properties: BasePropertyService,
    private readonly pageRepo: PageRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageAccess: PageAccessService,
  ) {}

  definitions(actor: ToolActor): ToolDefinition[] {
    return [
      {
        name: 'list_bases',
        description: 'List the bases (databases) of a space.',
        inputSchema: z.object({
          space_id: z.string().min(1).max(100).describe('Space id or slug'),
          limit: z.number().int().min(1).max(100).optional(),
          cursor: z.string().optional(),
        }),
        readOnly: true,
        run: (a) => this.listBases(actor, a),
      },
      {
        name: 'get_base',
        description:
          'Read a base: its properties (name, type, choices, read-only) and views. Read it before querying or writing rows.',
        inputSchema: z.object({ base_id: BASE_ID }),
        readOnly: true,
        run: (a) => this.getBase(actor, a),
      },
      {
        name: 'query_base_rows',
        description: `Read rows of a base, cells by property name. Optional search text, filter and sorts by property name. Filter example: ${FILTER_EXAMPLE}. Ops: eq, neq, gt, gte, lt, lte, contains, ncontains, startsWith, endsWith, isEmpty, isNotEmpty, before, after, onOrBefore, onOrAfter, any, none, all.`,
        inputSchema: z.object({
          base_id: BASE_ID,
          search: z.string().max(200).optional(),
          filter: z.any().optional(),
          sorts: z
            .array(
              z.object({
                property: z.string(),
                direction: z.enum(['asc', 'desc']).optional(),
              }),
            )
            .max(5)
            .optional(),
          limit: z.number().int().min(1).max(MAX_ROWS).optional(),
          cursor: z.string().optional(),
        }),
        readOnly: true,
        run: (a) => this.queryRows(actor, a),
      },
      {
        name: 'create_base_rows',
        description: `Add rows to a base (at most ${MAX_ROWS}). Example rows: [{"Name":"Write docs","Status":"In progress","Assignee":"an@example.com","Due":"2026-11-01"}]`,
        inputSchema: z.object({
          base_id: BASE_ID,
          rows: z.array(CELLS).min(1).max(MAX_ROWS),
        }),
        readOnly: false,
        run: (a) => this.createRows(actor, a),
      },
      {
        name: 'update_base_rows',
        description: `Change cells of rows (at most ${MAX_ROWS}); cells not given stay as they are.`,
        inputSchema: z.object({
          base_id: BASE_ID,
          updates: z
            .array(z.object({ row_id: z.string().uuid(), cells: CELLS }))
            .min(1)
            .max(MAX_ROWS),
        }),
        readOnly: false,
        run: (a) => this.updateRows(actor, a),
      },
      {
        name: 'delete_base_rows',
        description: 'Delete rows of a base.',
        inputSchema: z.object({
          base_id: BASE_ID,
          row_ids: z.array(z.string().uuid()).min(1).max(MAX_ROWS),
        }),
        readOnly: false,
        run: (a) => this.deleteRows(actor, a),
      },
      {
        name: 'create_base',
        description:
          'Create a new base (database page) in a space or under a page. template "kanban" adds a Status property and a board view.',
        inputSchema: z.object({
          name: z.string().min(1).max(500),
          space_id: z.string().max(100).optional().describe('Space id or slug'),
          parent_page_id: z.string().max(300).optional(),
          template: z.enum(['kanban']).optional(),
        }),
        readOnly: false,
        run: (a) => this.createBase(actor, a),
      },
      {
        name: 'add_base_property',
        description:
          'Add a property (column) to a base. For select, status and multiSelect give the choice names.',
        inputSchema: z.object({
          base_id: BASE_ID,
          name: z.string().min(1).max(100),
          type: z.enum(
            BASE_PROPERTY_TYPES.filter((t) => t !== 'formula') as [
              string,
              ...string[],
            ],
          ),
          choices: z.array(z.string().min(1).max(200)).max(100).optional(),
          allow_multiple: z
            .boolean()
            .optional()
            .describe('person: more than one person per cell'),
        }),
        readOnly: false,
        run: (a) => this.addProperty(actor, a),
      },
    ];
  }

  async listBases(actor: ToolActor, args: { space_id: string; limit?: number; cursor?: string }) {
    const space = await this.spaceRepo.findById(args.space_id, actor.workspace.id);
    if (!space) throw new NotFoundException('Space not found');
    const result = await this.bases.list(space.id, actor.user, actor.workspace, args);
    return {
      bases: result.items.map((b) => ({ id: b.id, slug_id: b.slugId, name: b.name })),
      next_cursor: result.meta.nextCursor,
    };
  }

  async getBase(actor: ToolActor, args: { base_id: string }) {
    const { page, permissions } = await this.bases.getViewablePage(
      normalizePageRef(args.base_id),
      actor.user,
      actor.workspace,
    );
    const info = await this.bases.getInfo(page, permissions);
    return {
      id: page.id,
      name: info.name,
      can_edit: !!(permissions as any)?.canEdit,
      properties: (info.properties as ToolProperty[]).map(describeProperty),
      views: info.views.map((v: any) => ({ id: v.id, name: v.name, type: v.type })),
    };
  }

  async queryRows(
    actor: ToolActor,
    args: {
      base_id: string;
      search?: string;
      filter?: any;
      sorts?: { property: string; direction?: string }[];
      limit?: number;
      cursor?: string;
    },
  ) {
    const { page } = await this.bases.getViewablePage(
      normalizePageRef(args.base_id),
      actor.user,
      actor.workspace,
    );
    const props = await this.schema(page);
    const refs: CellRefs = {
      users: await this.users(actor, args.filter ? filterReferences(args.filter) : []),
      pages: new Map(),
    };
    const result = await this.rows.list(
      page,
      {
        pageId: page.id,
        search: args.search,
        filter: args.filter ? toFilter(props, args.filter, refs) : undefined,
        sorts: toSorts(props, args.sorts),
        limit: args.limit ?? 50,
        cursor: args.cursor,
      },
      actor.user,
    );
    return {
      rows: result.items.map((row) => readRow(props, row as any, result.references)),
      next_cursor: result.meta.nextCursor ?? null,
    };
  }

  async createRows(actor: ToolActor, args: { base_id: string; rows: Record<string, unknown>[] }) {
    const page = await this.editable(actor, args.base_id);
    const props = await this.schema(page);
    const refs = await this.cellRefs(actor, props, args.rows);
    // every row is checked before the first one is written
    const cells = args.rows.map((row, i) => this.at(`rows.${i}`, () => toCells(props, row, refs)));
    const created: string[] = [];
    for (const row of cells) {
      const inserted = await this.rows.create(page, { pageId: page.id, cells: row }, actor.user);
      created.push(inserted.id);
    }
    return { created_row_ids: created };
  }

  async updateRows(
    actor: ToolActor,
    args: { base_id: string; updates: { row_id: string; cells: Record<string, unknown> }[] },
  ) {
    const page = await this.editable(actor, args.base_id);
    const props = await this.schema(page);
    const refs = await this.cellRefs(actor, props, args.updates.map((u) => u.cells));
    const patches = args.updates.map((u, i) => ({
      rowId: u.row_id,
      cells: this.at(`updates.${i}`, () => toCells(props, u.cells, refs)),
    }));
    for (const patch of patches) {
      await this.rows.update(page, { pageId: page.id, ...patch }, actor.user);
    }
    return { updated_row_ids: patches.map((p) => p.rowId) };
  }

  async deleteRows(actor: ToolActor, args: { base_id: string; row_ids: string[] }) {
    const page = await this.editable(actor, args.base_id);
    await this.rows.deleteMany(page, { pageId: page.id, rowIds: args.row_ids }, actor.user);
    return { deleted_row_ids: args.row_ids };
  }

  async createBase(
    actor: ToolActor,
    args: { name: string; space_id?: string; parent_page_id?: string; template?: 'kanban' },
  ) {
    let spaceId: string | undefined;
    if (args.space_id && !args.parent_page_id) {
      const space = await this.spaceRepo.findById(args.space_id, actor.workspace.id);
      if (!space) throw new NotFoundException('Space not found');
      spaceId = space.id;
    }
    if (!spaceId && !args.parent_page_id) {
      throw new BadRequestException('Give space_id or parent_page_id');
    }
    let parentPageId: string | undefined;
    if (args.parent_page_id) {
      const parent = await this.pageRepo.findById(normalizePageRef(args.parent_page_id));
      if (!parent || parent.workspaceId !== actor.workspace.id) {
        throw new NotFoundException('Parent page not found');
      }
      parentPageId = parent.id;
    }
    const base = await this.bases.create(
      { name: args.name, spaceId, parentPageId, template: args.template },
      actor.user,
      actor.workspace,
    );
    return {
      id: base.id,
      slug_id: base.slugId,
      name: base.name,
      properties: (base.properties as ToolProperty[]).map(describeProperty),
    };
  }

  async addProperty(
    actor: ToolActor,
    args: { base_id: string; name: string; type: string; choices?: string[]; allow_multiple?: boolean },
  ) {
    const page = await this.editable(actor, args.base_id);
    let typeOptions: any;
    if (['select', 'status', 'multiSelect'].includes(args.type)) {
      typeOptions = choiceOptions(args.choices ?? [], generateBaseChoiceId);
    } else if (args.type === 'person' && args.allow_multiple) {
      typeOptions = { allowMultiple: true };
    }
    const property = await this.properties.create(
      page,
      { pageId: page.id, name: args.name, type: args.type, typeOptions },
      actor.user,
    );
    return describeProperty(property as ToolProperty);
  }

  private async editable(actor: ToolActor, baseId: string) {
    return this.bases.getEditablePage(normalizePageRef(baseId), actor.user, actor.workspace);
  }

  private async schema(page: Page): Promise<ToolProperty[]> {
    const info = await this.bases.getInfo(page);
    return info.properties as ToolProperty[];
  }

  // a conversion error names the row it is about
  private at<T>(where: string, fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw new BadRequestException(`${where}: ${err.message}`);
      }
      throw err;
    }
  }

  private async cellRefs(
    actor: ToolActor,
    props: ToolProperty[],
    cellsList: Record<string, unknown>[],
  ): Promise<CellRefs> {
    const wanted = cellReferences(props, cellsList);
    return {
      users: await this.users(actor, wanted.users),
      pages: await this.pages(actor, wanted.pages),
    };
  }

  // workspace members by lower-cased email or id
  private async users(actor: ToolActor, keys: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const ids = keys.filter((k) => z.string().uuid().safeParse(k).success);
    const emails = keys.filter((k) => k.includes('@'));
    if (!ids.length && !emails.length) return map;
    const users = await this.db
      .selectFrom('users')
      .select(['id', 'email'])
      .where('workspaceId', '=', actor.workspace.id)
      .where('deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          ...(ids.length ? [eb('id', 'in', ids)] : []),
          ...(emails.length ? [eb(eb.fn('lower', ['email']), 'in', emails)] : []),
        ]),
      )
      .execute();
    for (const u of users) {
      map.set(u.id.toLowerCase(), u.id);
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    return map;
  }

  // pages the user can see, by the reference the model gave
  private async pages(actor: ToolActor, refs: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const ref of refs) {
      const page = await this.pageRepo.findById(normalizePageRef(ref));
      if (!page || page.workspaceId !== actor.workspace.id || page.deletedAt) continue;
      try {
        await this.pageAccess.validateCanView(page, actor.user);
        map.set(ref, page.id);
      } catch {
        // left out: reported as not found
      }
    }
    return map;
  }
}
