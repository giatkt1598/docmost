import { fuseRankings } from './rrf';

describe('fuseRankings', () => {
  it('keeps the order of a single list', () => {
    expect(fuseRankings([['a', 'b', 'c']])).toEqual(['a', 'b', 'c']);
  });

  it('puts ids found by several lists first', () => {
    expect(
      fuseRankings([
        ['a', 'b', 'c'],
        ['d', 'b', 'e'],
      ]),
    ).toEqual(['b', 'a', 'd', 'c', 'e']);
  });

  it('handles empty lists', () => {
    expect(fuseRankings([[], ['x']])).toEqual(['x']);
    expect(fuseRankings([])).toEqual([]);
  });
});
