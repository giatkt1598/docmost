import { buildSeed } from './templates';

describe('buildSeed', () => {
  it('seeds a table with a primary text property and one empty row', () => {
    const seed = buildSeed();
    expect(seed.properties.filter((p) => p.isPrimary)).toHaveLength(1);
    expect(seed.properties[0].type).toBe('text');
    expect(seed.views.map((v) => v.type)).toEqual(['table']);
    expect(seed.rows).toHaveLength(1);
  });

  it('seeds a board grouped by a status property', () => {
    const seed = buildSeed('kanban');
    const board = seed.views.find((v) => v.type === 'kanban');
    const status = seed.properties.find((p) => p.type === 'status');
    expect(board.config.groupByPropertyId).toBe(status.id);
    expect(status.typeOptions.choiceOrder).toHaveLength(3);
    // every card points at a real choice
    const ids = status.typeOptions.choices.map((c) => c.id);
    for (const row of seed.rows) expect(ids).toContain(row.cells[status.id]);
  });

  it('uses unique, ordered positions', () => {
    const seed = buildSeed('kanban');
    const pos = seed.rows.map((r) => r.position);
    expect(new Set(pos).size).toBe(pos.length);
    expect([...pos].sort()).toEqual(pos);
    const ids = seed.properties.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
