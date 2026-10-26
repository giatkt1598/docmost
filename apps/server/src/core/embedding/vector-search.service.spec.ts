import { relevantHits } from './vector-search.service';

const hit = (distance: number) => ({ distance });

describe('relevantHits', () => {
  it('returns nothing for no hits', () => {
    expect(relevantHits([])).toEqual([]);
  });

  it('keeps the hits close to the best one', () => {
    const hits = [hit(0.5), hit(0.3), hit(0.42), hit(0.7)];
    expect(relevantHits(hits).map((h) => h.distance)).toEqual([0.3, 0.42]);
  });

  it('drops everything when even the best hit is far', () => {
    expect(relevantHits([hit(0.9), hit(0.95)])).toEqual([]);
  });
});
