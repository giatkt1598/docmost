// Splitting page text into passages for embedding. Pure functions.

export type TextChunk = { index: number; content: string };

const DEFAULT_SIZE = 1500;
const DEFAULT_OVERLAP = 200;
const MAX_CHUNKS = 400;

// Cuts a long paragraph at sentence or word boundaries.
function splitLong(text: string, size: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > size) {
    const window = rest.slice(0, size);
    let cut = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
    );
    if (cut < size * 0.5) cut = window.lastIndexOf(' ');
    if (cut < size * 0.5) cut = size;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// The end of a chunk, cut at a word boundary, repeated at the start of the next.
function tail(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) return '';
  const slice = text.slice(text.length - overlap);
  const space = slice.indexOf(' ');
  return space >= 0 ? slice.slice(space + 1) : slice;
}

export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number } = {},
): TextChunk[] {
  const size = opts.size ?? DEFAULT_SIZE;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;

  const paragraphs = (text ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > size ? splitLong(p, size) : [p]));

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > size) {
      chunks.push(current);
      const carry = tail(current, overlap);
      current = carry ? `${carry}\n${paragraph}` : paragraph;
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);

  return chunks
    .slice(0, MAX_CHUNKS)
    .map((content, index) => ({ index, content }));
}
