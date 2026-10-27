import {
  cellReferences,
  choiceOptions,
  describeProperty,
  readRow,
  toCells,
  toFilter,
  toSorts,
  ToolProperty,
} from './base-cells';

const props: ToolProperty[] = [
  { id: 'p_name', name: 'Name', type: 'text', typeOptions: {} },
  {
    id: 'p_status',
    name: 'Status',
    type: 'status',
    typeOptions: {
      choices: [
        { id: 'c_todo', name: 'Not started' },
        { id: 'c_done', name: 'Done' },
      ],
    },
  },
  {
    id: 'p_tags',
    name: 'Tags',
    type: 'multiSelect',
    typeOptions: {
      choices: [
        { id: 't_a', name: 'Alpha' },
        { id: 't_b', name: 'Beta' },
      ],
    },
  },
  { id: 'p_owner', name: 'Owner', type: 'person', typeOptions: {} },
  { id: 'p_due', name: 'Due', type: 'date', typeOptions: {} },
  { id: 'p_pts', name: 'Points', type: 'number', typeOptions: {} },
  { id: 'p_ok', name: 'Approved', type: 'checkbox', typeOptions: {} },
  { id: 'p_f', name: 'Score', type: 'formula', typeOptions: {} },
  { id: 'p_c', name: 'Created', type: 'createdAt', typeOptions: {} },
];

const USER = '01a17ad8-717d-767f-9a95-424f8ef9f18d';
const refs = {
  users: new Map([
    ['an@example.com', USER],
    [USER, USER],
  ]),
  pages: new Map<string, string>(),
};

describe('base cells for the AI tools', () => {
  it('turns names and readable values into stored cells', () => {
    expect(
      toCells(
        props,
        {
          name: 'Write docs',
          Status: 'done',
          Tags: 'Alpha, Beta',
          Owner: 'AN@example.com',
          Due: '2026-11-01',
          Points: '3',
          Approved: 'yes',
        },
        refs,
      ),
    ).toEqual({
      p_name: 'Write docs',
      p_status: 'c_done',
      p_tags: ['t_a', 't_b'],
      p_owner: USER,
      p_due: '2026-11-01',
      p_pts: 3,
      p_ok: true,
    });
    expect(toCells(props, { Status: null, Name: '' }, refs)).toEqual({
      p_status: null,
      p_name: null,
    });
  });

  it('explains what is wrong, with the valid choices', () => {
    expect(() => toCells(props, { Status: 'Doing' }, refs)).toThrow(
      /"Doing" is not a choice of "Status". Choices: "Not started", "Done"/,
    );
    expect(() => toCells(props, { Score: 1 }, refs)).toThrow(/read-only/);
    expect(() => toCells(props, { Color: 'red' }, refs)).toThrow(
      /Unknown property "Color". Properties: "Name", "Status"/,
    );
    expect(() => toCells(props, { Owner: 'x@y.z' }, refs)).toThrow(
      /not a member/,
    );
    expect(() => toCells(props, { Due: 'soon' }, refs)).toThrow(/ISO date/);
  });

  it('lists the people and pages to look up', () => {
    expect(
      cellReferences(props, [{ owner: 'AN@example.com' }, { Name: 'x' }]),
    ).toEqual({ users: ['an@example.com'], pages: [] });
  });

  it('translates filters and sorts by name', () => {
    expect(
      toFilter(
        props,
        {
          op: 'and',
          children: [
            { property: 'Status', op: 'eq', value: 'Done' },
            { property: 'Owner', op: 'any', value: ['an@example.com'] },
            { property: 'Due', op: 'isEmpty' },
          ],
        },
        refs,
      ),
    ).toEqual({
      op: 'and',
      children: [
        { propertyId: 'p_status', op: 'eq', value: 'c_done' },
        { propertyId: 'p_owner', op: 'any', value: [USER] },
        { propertyId: 'p_due', op: 'isEmpty' },
      ],
    });
    expect(() =>
      toFilter(props, { property: 'Name', op: 'like', value: 'x' }, refs),
    ).toThrow(/Unknown filter op/);
    expect(toSorts(props, [{ property: 'due', direction: 'desc' }])).toEqual([
      { propertyId: 'p_due', direction: 'desc' },
    ]);
  });

  it('reads rows with names instead of ids', () => {
    const row = {
      id: 'r1',
      cells: { p_status: 'c_done', p_tags: ['t_b'], p_owner: USER, p_f: 7 },
      createdAt: '2026-10-27T00:00:00Z',
    };
    const read = readRow(props, row, {
      users: { [USER]: { id: USER, name: 'An' } },
      pages: {},
    });
    expect(read.row_id).toBe('r1');
    expect(read.cells).toMatchObject({
      Name: null,
      Status: 'Done',
      Tags: ['Beta'],
      Owner: { id: USER, name: 'An' },
      Score: 7,
      Created: '2026-10-27T00:00:00Z',
    });
  });

  it('describes properties and builds choices', () => {
    expect(describeProperty(props[1])).toEqual({
      id: 'p_status',
      name: 'Status',
      type: 'status',
      choices: ['Not started', 'Done'],
    });
    expect(describeProperty(props[7]).read_only).toBe(true);
    let n = 0;
    const options = choiceOptions(['A', 'B', 'A', ' '], () => `c${n++}`);
    expect(options.choices.map((c) => c.name)).toEqual(['A', 'B']);
    expect(options.choiceOrder).toEqual(['c0', 'c1']);
  });
});
