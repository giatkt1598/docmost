import { Injectable } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';
import { Page } from '@docmost/db/types/entity.types';
import { jsonb } from '@docmost/db/repos/base/jsonb';
import { BasePropertyRepo } from '@docmost/db/repos/base/base-property.repo';
import { BaseRowRepo } from '@docmost/db/repos/base/base-row.repo';
import { BaseViewRepo } from '@docmost/db/repos/base/base-view.repo';
import { BaseReferenceService } from './base-reference.service';
import { formatCsvCell } from './base-export.service';
import { MAX_ROWS_PER_BASE } from './base.events';
import { BASE_PROPERTY_TYPES, BASE_VIEW_TYPES } from './engine/base.types';

export const BASE_DATA_FORMAT = 'docmost-base';
export const BASE_DATA_EXTENSION = '.base.json';
const INSERT_BATCH = 1000;

const baseDataSchema = z.object({
  format: z.literal(BASE_DATA_FORMAT),
  version: z.literal(1),
  properties: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(500),
        type: z.enum(BASE_PROPERTY_TYPES),
        typeOptions: z.record(z.string(), z.any()).nullable().optional(),
        position: z.string().min(1),
        isPrimary: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
  views: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum(BASE_VIEW_TYPES),
        position: z.string().min(1),
        config: z.record(z.string(), z.any()).nullable().optional(),
      }),
    )
    .max(100),
  rows: z
    .array(
      z.object({
        position: z.string().min(1),
        cells: z.record(z.string(), z.any()),
      }),
    )
    .max(MAX_ROWS_PER_BASE),
});

export type BaseData = z.infer<typeof baseDataSchema>;

// Moves a base's schema and rows in and out of page exports, so exporting a
// space and importing it again keeps the bases.
@Injectable()
export class BaseTransferService {
  constructor(
    private readonly propertyRepo: BasePropertyRepo,
    private readonly rowRepo: BaseRowRepo,
    private readonly viewRepo: BaseViewRepo,
    private readonly references: BaseReferenceService,
  ) {}

  // Full-fidelity JSON plus a CSV that spreadsheet apps can open.
  async exportBase(page: Page): Promise<{ json: string; csv: string }> {
    const [properties, views] = await Promise.all([
      this.propertyRepo.findByPageId(page.id),
      this.viewRepo.findByPageId(page.id),
    ]);
    const rows: BaseData['rows'] = [];
    const csvLines = [stringify([properties.map((p) => p.name)])];
    for await (const batch of this.rowRepo.iterate(page.id, null, [])) {
      const refs = await this.references.forPublicRows(
        batch,
        properties,
        page.workspaceId,
      );
      for (const row of batch) {
        rows.push({
          position: row.position,
          cells: row.cells as Record<string, unknown>,
        });
      }
      csvLines.push(
        stringify(
          batch.map((row) => properties.map((p) => formatCsvCell(p, row, refs))),
        ),
      );
    }
    const data: BaseData = {
      format: BASE_DATA_FORMAT,
      version: 1,
      properties: properties.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type as BaseData['properties'][number]['type'],
        typeOptions: (p.typeOptions as Record<string, unknown>) ?? {},
        position: p.position,
        isPrimary: p.isPrimary,
      })),
      views: views.map((v) => ({
        name: v.name,
        type: v.type as BaseData['views'][number]['type'],
        position: v.position,
        config: (v.config as Record<string, unknown>) ?? {},
      })),
      rows,
    };
    return { json: JSON.stringify(data), csv: '﻿' + csvLines.join('') };
  }

  // Returns null when the text is not base data this version understands.
  parse(text: string): BaseData | null {
    try {
      const result = baseDataSchema.safeParse(JSON.parse(text));
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  // Fills an already inserted page with the base. `pageIdMap` maps page ids
  // of the export to the imported pages, for page cells.
  async importBase(
    data: BaseData,
    target: { pageId: string; workspaceId: string; creatorId: string },
    pageIdMap: Map<string, string>,
    trx: KyselyTransaction,
  ): Promise<void> {
    const { pageId, workspaceId, creatorId } = target;
    const seen = new Set<string>();
    const properties = data.properties.filter((p) => {
      const lower = p.name.trim().toLowerCase();
      if (seen.has(p.id) || seen.has(`name:${lower}`)) return false;
      seen.add(p.id);
      seen.add(`name:${lower}`);
      return true;
    });
    const primary =
      properties.find((p) => p.isPrimary) ??
      properties.find((p) => p.type === 'text');
    const known = new Map(properties.map((p) => [p.id, p.type]));

    await this.propertyRepo.insertMany(
      properties.map((p) => ({
        id: p.id,
        pageId,
        workspaceId,
        name: p.name.trim(),
        type: p.type,
        typeOptions: jsonb(p.typeOptions ?? {}),
        position: p.position,
        isPrimary: p === primary,
      })),
      trx,
    );
    if (data.views.length) {
      await this.viewRepo.insertMany(
        data.views.map((v) => ({
          pageId,
          workspaceId,
          creatorId,
          name: v.name,
          type: v.type,
          position: v.position,
          config: jsonb(v.config ?? {}),
        })),
        trx,
      );
    }

    for (let i = 0; i < data.rows.length; i += INSERT_BATCH) {
      const chunk = data.rows.slice(i, i + INSERT_BATCH);
      await this.rowRepo.insertMany(
        chunk.map((r) => ({
          pageId,
          workspaceId,
          creatorId,
          lastUpdatedById: creatorId,
          position: r.position,
          cells: jsonb(remapCells(r.cells, known, pageIdMap)),
        })),
        trx,
      );
    }
  }
}

// Keeps the cells of known properties and points page cells at the imported
// copies of the pages they referenced.
function remapCells(
  cells: Record<string, unknown>,
  known: Map<string, string>,
  pageIdMap: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cells)) {
    const type = known.get(key);
    if (!type || value === null || value === undefined) continue;
    if (type === 'page' && typeof value === 'string') {
      out[key] = pageIdMap.get(value) ?? value;
    } else {
      out[key] = value;
    }
  }
  return out;
}
