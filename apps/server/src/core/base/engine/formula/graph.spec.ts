import { FormulaGraph } from './graph';

const f = (id: string, deps: unknown) => ({
  id,
  type: 'formula',
  typeOptions: { dependencies: deps },
});
const plain = (id: string) => ({ id, type: 'number', typeOptions: {} });

describe('FormulaGraph', () => {
  // c <- f1 <- f2 <- f4 ; f3 <- c ; f5 standalone
  const graph = new FormulaGraph([
    f('f4', ['f2']),
    plain('c'),
    f('f2', ['f1', 'c']),
    f('f1', ['c']),
    f('f3', ['c']),
    f('f5', []),
    plain('d'),
  ]);

  it('orders formulas after their dependencies, keeping property order', () => {
    expect(graph.evalOrder()).toEqual(['f1', 'f2', 'f4', 'f3', 'f5']);
  });

  it('finds affected formulas transitively, in evaluation order', () => {
    expect(graph.affectedFormulas(['c'])).toEqual(['f1', 'f2', 'f4', 'f3']);
    expect(graph.affectedFormulas(['f1'])).toEqual(['f2', 'f4']);
    expect(graph.affectedFormulas(['d'])).toEqual([]);
    expect(graph.affectedFormulas([])).toEqual([]);
    expect(graph.dependents('f2')).toEqual(['f4']);
  });

  it('ignores non-formula properties and bad dependency lists', () => {
    const g = new FormulaGraph([
      plain('a'),
      f('x', 'nope'),
      f('y', ['a', 1, null, 'a']),
    ]);
    expect(g.isFormula('a')).toBe(false);
    expect(g.isFormula('x')).toBe(true);
    expect(g.dependenciesOf('x')).toEqual([]);
    expect(g.dependenciesOf('y')).toEqual(['a']);
    expect(g.affectedFormulas(['a'])).toEqual(['y']);
  });

  it('finds cycles as paths', () => {
    const g = new FormulaGraph([
      f('a', ['b']),
      f('b', ['c']),
      f('c', ['a']),
      f('d', ['a']),
      f('self', ['self']),
    ]);
    expect(g.findCycle('a')).toEqual(['a', 'b', 'c', 'a']);
    expect(g.findCycle('d')).toBeNull();
    expect(g.findCycle('self')).toEqual(['self', 'self']);
    expect(graph.findCycle('f4')).toBeNull();
  });

  it('still lists formulas caught in a cycle, last', () => {
    const g = new FormulaGraph([f('a', ['b']), f('b', ['a']), f('c', [])]);
    expect(g.evalOrder()).toEqual(['c', 'a', 'b']);
  });
});
