import { BlockInput } from '../blocks/doc-blocks';
import { Span } from '../blocks/rich-text';
import { BlockPatch, Operation } from './engine';

// Models write blocks in a few natural shapes the strict format does not
// use: text as a plain string, list items without a type, table cells as
// strings, Markdown under "text". This turns them into the strict shapes so
// the engine sees one format. Pure.

export class InputShapeError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(message);
  }
}

type Loose = any;

function richText(value: Loose, path: string): Span[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value ? [{ text: value }] : [];
  if (Array.isArray(value)) {
    return value.map((span, i) =>
      typeof span === 'string' ? { text: span } : span,
    ) as Span[];
  }
  throw new InputShapeError(
    'rich_text must be a string or a list of spans',
    path,
  );
}

function rows(value: Loose, path: string): Span[][][] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new InputShapeError('rows must be a list of rows', path);
  }
  return value.map((row, r) => {
    if (!Array.isArray(row)) {
      throw new InputShapeError(
        'each row must be a list of cells',
        `${path}.${r}`,
      );
    }
    return row.map(
      (cell, c) => richText(cell ?? '', `${path}.${r}.${c}`) ?? [],
    );
  });
}

const ITEM_TYPE: Record<string, 'list_item' | 'todo_item'> = {
  bulleted_list: 'list_item',
  numbered_list: 'list_item',
  todo_list: 'todo_item',
};

function block(input: Loose, path: string, itemType?: string): BlockInput {
  if (typeof input === 'string') {
    if (itemType) return { type: itemType as any, text: input };
    return { type: 'paragraph', text: input };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (itemType && Array.isArray(input)) {
      return { type: itemType as any, rich_text: richText(input, path) };
    }
    throw new InputShapeError('a block must be an object with a type', path);
  }
  const type = input.type ?? itemType;
  if (!type) {
    throw new InputShapeError('this block has no "type"', path);
  }
  const out: Loose = { ...input, type };

  if (type === 'markdown' && out.markdown === undefined && out.text) {
    out.markdown = out.text;
    delete out.text;
  }
  // a plain string where spans belong
  if (out.rich_text !== undefined) {
    out.rich_text = richText(out.rich_text, `${path}.rich_text`);
  }
  if (out.rows !== undefined) out.rows = rows(out.rows, `${path}.rows`);

  const childItemType = ITEM_TYPE[type];
  if (out.items !== undefined) {
    if (!Array.isArray(out.items)) {
      throw new InputShapeError('items must be a list', `${path}.items`);
    }
    out.items = out.items.map((item: Loose, i: number) =>
      typeof item === 'string'
        ? item
        : block(item, `${path}.items.${i}`, childItemType),
    );
  }
  if (out.children !== undefined) {
    if (!Array.isArray(out.children)) {
      throw new InputShapeError('children must be a list', `${path}.children`);
    }
    out.children = out.children.map((child: Loose, i: number) =>
      block(child, `${path}.children.${i}`, childItemType),
    );
  }
  return out as BlockInput;
}

function patch(input: Loose, path: string): BlockPatch {
  const out: Loose = { ...(input ?? {}) };
  if (out.rich_text !== undefined) {
    out.rich_text = richText(out.rich_text, `${path}.rich_text`);
  }
  if (out.rows !== undefined) out.rows = rows(out.rows, `${path}.rows`);
  if (Array.isArray(out.cells)) {
    out.cells = out.cells.map((cell: Loose, i: number) => ({
      ...cell,
      ...(cell?.rich_text !== undefined && {
        rich_text: richText(cell.rich_text, `${path}.cells.${i}.rich_text`),
      }),
    }));
  }
  return out;
}

export function normalizeOperations(operations: Loose[]): Operation[] {
  return operations.map((op, i) => {
    const path = `operations.${i}`;
    if (op?.op === 'insert') {
      return {
        ...op,
        blocks: (op.blocks ?? []).map((b: Loose, j: number) =>
          block(b, `${path}.blocks.${j}`),
        ),
      };
    }
    if (op?.op === 'update') {
      return { ...op, patch: patch(op.patch, `${path}.patch`) };
    }
    return op;
  });
}
