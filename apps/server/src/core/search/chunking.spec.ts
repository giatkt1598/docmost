import { chunkText } from './chunking';

describe('chunkText', () => {
  it('returns nothing for empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('  \n \n')).toEqual([]);
  });

  it('keeps short text in one chunk', () => {
    expect(chunkText('one\ntwo')).toEqual([{ index: 0, content: 'one\ntwo' }]);
  });

  it('splits on paragraph boundaries within the size', () => {
    const para = 'a'.repeat(40);
    const chunks = chunkText([para, para, para].join('\n'), {
      size: 100,
      overlap: 0,
    });
    expect(chunks.map((c) => c.content)).toEqual([`${para}\n${para}`, para]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it('cuts a paragraph longer than the size', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Câu số ${i}.`).join(' ');
    const chunks = chunkText(text, { size: 100, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(100);
  });

  it('repeats the end of a chunk at the start of the next', () => {
    const text = ['alpha beta gamma delta', 'epsilon zeta eta theta'].join(
      '\n',
    );
    const chunks = chunkText(text, { size: 30, overlap: 12 });
    expect(chunks).toHaveLength(2);
    expect(chunks[1].content.startsWith('gamma delta')).toBe(true);
  });
});
