import { formatCsvCell } from './base-export.service';

const prop = (type: string, typeOptions: any = {}): any => ({
  id: 'p',
  type,
  typeOptions,
});
const row = (cells: any): any => ({
  cells,
  createdAt: new Date('2024-01-02T03:04:05Z'),
  updatedAt: new Date('2024-02-03T04:05:06Z'),
  creatorId: 'u1',
  lastUpdatedById: 'u2',
});
const refs: any = {
  users: { u1: { name: 'Ada' }, u2: { name: 'Bob' } },
  pages: { pg: { title: 'Home' } },
};

describe('formatCsvCell', () => {
  it('prints names for choices, people and pages', () => {
    const opts = { choices: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] };
    expect(formatCsvCell(prop('select', opts), row({ p: 'a' }), refs)).toBe('Alpha');
    expect(formatCsvCell(prop('multiSelect', opts), row({ p: ['a', 'b'] }), refs)).toBe('Alpha; Beta');
    expect(formatCsvCell(prop('person'), row({ p: ['u1', 'u2'] }), refs)).toBe('Ada; Bob');
    expect(formatCsvCell(prop('page'), row({ p: 'pg' }), refs)).toBe('Home');
  });

  it('reads system properties from the row', () => {
    expect(formatCsvCell(prop('createdAt'), row({}), refs)).toBe('2024-01-02T03:04:05.000Z');
    expect(formatCsvCell(prop('lastEditedBy'), row({}), refs)).toBe('Bob');
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(formatCsvCell(prop('text'), row({ p: '=SUM(A1)' }), refs)).toBe("'=SUM(A1)");
    expect(formatCsvCell(prop('text'), row({ p: 'plain' }), refs)).toBe('plain');
  });

  it('prints empty cells, booleans and formula errors', () => {
    expect(formatCsvCell(prop('text'), row({}), refs)).toBe('');
    expect(formatCsvCell(prop('checkbox'), row({ p: true }), refs)).toBe('true');
    expect(formatCsvCell(prop('formula'), row({ p: { __err: 'X', msg: '', v: 1 } }), refs)).toBe('#ERROR');
  });
});
