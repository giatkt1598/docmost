import { compileFormulaSource, NamedProperty } from './compiler';
import { renamePropertyReferences } from './rename';

describe('renamePropertyReferences', () => {
  it('rewrites every reference and keeps the rest of the source', () => {
    expect(
      renamePropertyReferences(
        'prop("Price") * 2 + PROP( "Price" ) - prop("Prices")',
        'Price',
        'Cost',
      ),
    ).toBe('prop("Cost") * 2 + PROP( "Cost" ) - prop("Prices")');
  });

  it('keeps the quote style and escapes the new name', () => {
    expect(renamePropertyReferences("prop('A')", 'A', "It's")).toBe(
      "prop('It\\'s')",
    );
    expect(renamePropertyReferences('prop("A")', 'A', 'Say "hi"')).toBe(
      'prop("Say \\"hi\\"")',
    );
    expect(renamePropertyReferences('prop("A")', 'A', 'back\\slash')).toBe(
      'prop("back\\\\slash")',
    );
  });

  it('matches names the way references resolve (case, spaces, escapes)', () => {
    expect(renamePropertyReferences('prop("price ")', 'Price', 'Cost')).toBe(
      'prop("Cost")',
    );
    expect(
      renamePropertyReferences('prop("Say \\"hi\\"")', 'Say "hi"', 'Greeting'),
    ).toBe('prop("Greeting")');
  });

  it('leaves text that only looks like a reference', () => {
    expect(
      renamePropertyReferences(
        '"prop(\\"Price\\")" + prop("Price")',
        'Price',
        'Cost',
      ),
    ).toBe('"prop(\\"Price\\")" + prop("Cost")');
    expect(renamePropertyReferences('"Price"', 'Price', 'Cost')).toBe(
      '"Price"',
    );
  });

  it('returns the source unchanged when nothing matches', () => {
    expect(renamePropertyReferences('1 + 2', 'A', 'B')).toBe('1 + 2');
    expect(renamePropertyReferences('prop("A")', 'A', 'A')).toBe('prop("A")');
    expect(renamePropertyReferences('', 'A', 'B')).toBe('');
    expect(
      renamePropertyReferences(undefined as any, 'A', 'B'),
    ).toBeUndefined();
  });

  it('falls back to a pattern for sources that do not tokenize', () => {
    expect(
      renamePropertyReferences('prop("A") = 1 # old', 'A', 'New name'),
    ).toBe('prop("New name") = 1 # old');
  });

  it('produces a source that compiles to the same references', () => {
    const before: NamedProperty[] = [
      { id: 'p1', name: 'Unit price', type: 'number', typeOptions: {} },
      { id: 'p2', name: 'Qty', type: 'number', typeOptions: {} },
    ];
    const compiled = compileFormulaSource(
      'prop("Unit price") * prop("Qty")',
      before,
      null,
    );
    const source = renamePropertyReferences(
      compiled.source,
      'Unit price',
      'Price',
    );
    const after = before.map((p) =>
      p.id === 'p1' ? { ...p, name: 'Price' } : p,
    );
    const recompiled = compileFormulaSource(source, after, null);
    expect(source).toBe('prop("Price") * prop("Qty")');
    expect(recompiled.ast).toEqual(compiled.ast);
    expect(recompiled.dependencies).toEqual(compiled.dependencies);
  });
});
