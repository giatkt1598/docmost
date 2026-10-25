import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import { stringify } from 'csv-stringify/sync';
import { BaseProperty, BaseRow, Page, User } from '@docmost/db/types/entity.types';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { guard } from './base.errors';
import { BaseReferenceService, RowReferences } from './base-reference.service';
import { toEngineProperty } from './base-formula.service';
import { EngineProperty } from './engine/base.types';
import { compileFilter } from './engine/filter-compiler';
import { parseFilter } from './engine/schema.zod';

const BOM = '﻿';

// Spreadsheet apps run text that starts with these characters as a formula.
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function choiceNames(prop: BaseProperty, ids: unknown): string {
  const choices: any[] = (prop.typeOptions as any)?.choices ?? [];
  const list = Array.isArray(ids) ? ids : [ids];
  return list
    .map((id) => choices.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join('; ');
}

export function formatCsvCell(
  prop: BaseProperty,
  row: BaseRow,
  refs: RowReferences,
): string {
  const cells = row.cells as Record<string, any>;
  const value = cells[prop.id];
  const userName = (id?: string | null) =>
    (id && refs.users[id]?.name) || '';
  switch (prop.type) {
    case 'createdAt':
      return new Date(row.createdAt).toISOString();
    case 'lastEditedAt':
      return new Date(row.updatedAt).toISOString();
    case 'lastEditedBy':
      return userName(row.lastUpdatedById ?? row.creatorId);
  }
  if (value === undefined || value === null) return '';
  switch (prop.type) {
    case 'select':
    case 'status':
    case 'multiSelect':
      return neutralize(choiceNames(prop, value));
    case 'person':
      return neutralize(
        (Array.isArray(value) ? value : [value]).map(userName).join('; '),
      );
    case 'page':
      return neutralize(refs.pages[String(value)]?.title ?? '');
    case 'file':
      return neutralize(
        (Array.isArray(value) ? value : [])
          .map((f: any) => f?.fileName)
          .filter(Boolean)
          .join('; '),
      );
    case 'checkbox':
      return value ? 'true' : 'false';
    default:
      if (typeof value === 'object') {
        return '__err' in value ? '#ERROR' : '';
      }
      return typeof value === 'string' ? neutralize(value) : String(value);
  }
}

@Injectable()
export class BaseExportService {
  constructor(
    private readonly propertyRepo: BasePropertyRepo,
    private readonly rowRepo: BaseRowRepo,
    private readonly references: BaseReferenceService,
  ) {}

  async exportCsv(page: Page, filterInput: unknown, user: User) {
    return guard(async () => {
      const properties = await this.propertyRepo.findByPageId(page.id);
      const map = new Map<string, EngineProperty>(
        properties.map((p) => [p.id, toEngineProperty(p)]),
      );
      const tree =
        filterInput && Object.keys(filterInput as object).length > 0
          ? parseFilter(filterInput)
          : null;
      const filter = tree ? compileFilter(tree, map) : null;

      const rowRepo = this.rowRepo;
      const references = this.references;
      async function* chunks() {
        yield BOM + stringify([properties.map((p) => neutralize(p.name))]);
        for await (const batch of rowRepo.iterate(page.id, filter, [])) {
          const refs = await references.forRows(
            batch,
            properties,
            user,
            page.workspaceId,
          );
          yield stringify(
            batch.map((row) =>
              properties.map((p) => formatCsvCell(p, row, refs)),
            ),
          );
        }
      }
      const name = (page.title || 'base').replace(/[\\/:*?"<>|\r\n]+/g, '_');
      return { filename: `${name}.csv`, stream: Readable.from(chunks()) };
    });
  }
}
