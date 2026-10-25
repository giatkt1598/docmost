import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import {
  generateBaseChoiceId,
  generateBasePropertyId,
} from '../../../common/helpers/nanoid.utils';

export type BaseTemplate = 'kanban';

export type SeedProperty = {
  id: string;
  name: string;
  type: string;
  typeOptions: any;
  position: string;
  isPrimary: boolean;
};

export type SeedView = {
  name: string;
  type: 'table' | 'kanban';
  position: string;
  config: Record<string, unknown>;
};

export type SeedRow = {
  cells: Record<string, unknown>;
  position: string;
};

export type BaseSeed = {
  properties: SeedProperty[];
  views: SeedView[];
  rows: SeedRow[];
};

function positions(count: number): string[] {
  const out: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < count; i++) {
    last = generateJitteredKeyBetween(last, null);
    out.push(last);
  }
  return out;
}

function textOptions() {
  return {};
}

// A plain table: Title + two text columns and one empty row.
function tableSeed(): BaseSeed {
  const [p1, p2, p3] = positions(3);
  const title = generateBasePropertyId();
  const text1 = generateBasePropertyId();
  const text2 = generateBasePropertyId();
  const [r1] = positions(1);
  const [v1] = positions(1);
  return {
    properties: [
      { id: title, name: 'Title', type: 'text', typeOptions: textOptions(), position: p1, isPrimary: true },
      { id: text1, name: 'Text 1', type: 'text', typeOptions: textOptions(), position: p2, isPrimary: false },
      { id: text2, name: 'Text 2', type: 'text', typeOptions: textOptions(), position: p3, isPrimary: false },
    ],
    views: [{ name: 'Table', type: 'table', position: v1, config: {} }],
    rows: [{ cells: {}, position: r1 }],
  };
}

// A task board: Title + Status, grouped by Status in a Board view.
function kanbanSeed(): BaseSeed {
  const [p1, p2, p3] = positions(3);
  const title = generateBasePropertyId();
  const status = generateBasePropertyId();
  const notes = generateBasePropertyId();
  const todo = generateBaseChoiceId();
  const doing = generateBaseChoiceId();
  const done = generateBaseChoiceId();
  const [r1, r2, r3] = positions(3);
  const [v1, v2] = positions(2);
  return {
    properties: [
      { id: title, name: 'Title', type: 'text', typeOptions: textOptions(), position: p1, isPrimary: true },
      {
        id: status,
        name: 'Status',
        type: 'status',
        typeOptions: {
          choices: [
            { id: todo, name: 'Not started', color: 'gray', category: 'todo' },
            { id: doing, name: 'In progress', color: 'blue', category: 'inProgress' },
            { id: done, name: 'Done', color: 'green', category: 'complete' },
          ],
          choiceOrder: [todo, doing, done],
          defaultValue: todo,
        },
        position: p2,
        isPrimary: false,
      },
      { id: notes, name: 'Notes', type: 'longText', typeOptions: textOptions(), position: p3, isPrimary: false },
    ],
    views: [
      {
        name: 'Board',
        type: 'kanban',
        position: v1,
        config: { groupByPropertyId: status },
      },
      { name: 'Table', type: 'table', position: v2, config: {} },
    ],
    rows: [
      { cells: { [title]: 'Task 1', [status]: todo }, position: r1 },
      { cells: { [title]: 'Task 2', [status]: doing }, position: r2 },
      { cells: { [title]: 'Task 3', [status]: done }, position: r3 },
    ],
  };
}

export function buildSeed(template?: BaseTemplate | null): BaseSeed {
  return template === 'kanban' ? kanbanSeed() : tableSeed();
}
