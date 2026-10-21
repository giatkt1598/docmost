// Turning a natural-language question into a full-text query and picking
// the passages of a page that best match it. Pure functions, unit tested.

// words that carry no meaning for retrieval (Vietnamese and English)
const STOP_WORDS = new Set([
  'la',
  'gi',
  'cua',
  'va',
  'cac',
  'nhung',
  'mot',
  'co',
  'khong',
  'nao',
  'the',
  'nhu',
  'cho',
  'voi',
  'trong',
  'duoc',
  'den',
  'tu',
  'thi',
  'ma',
  'nay',
  'do',
  've',
  'o',
  'khi',
  'neu',
  'bao',
  'nhieu',
  'sao',
  'lam',
  'toi',
  'ban',
  'minh',
  'hay',
  'giup',
  'xin',
  'vui',
  'long',
  'cach',
  'what',
  'is',
  'are',
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'for',
  'and',
  'or',
  'how',
  'do',
  'does',
  'can',
  'i',
  'we',
  'you',
  'my',
  'our',
  'with',
  'about',
  'which',
  'who',
  'when',
  'where',
  'why',
  'please',
  'tell',
  'me',
  'there',
  'be',
  'it',
  'this',
  'that',
]);

export function unaccent(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

// Meaningful words of the question, accent-free, in their original order.
export function questionTerms(question: string): string[] {
  const words = unaccent(question)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 12);
}

// OR of prefix terms for to_tsquery; only letters and digits reach it.
export function orTsQuery(terms: string[]): string | null {
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(' | ');
}

// The paragraphs of a page that mention the most question terms, in
// document order, within a character budget.
export function bestPassages(
  text: string,
  terms: string[],
  budget: number,
): string {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return '';

  const scored = paragraphs.map((p, index) => {
    const plain = unaccent(p);
    const hits = terms.filter((t) => plain.includes(t)).length;
    return { p, index, hits };
  });
  const ranked = [...scored].sort(
    (a, b) => b.hits - a.hits || a.index - b.index,
  );

  const chosen = new Set<number>();
  let used = 0;
  for (const item of ranked) {
    if (item.hits === 0 && chosen.size > 0) break;
    const length = Math.min(item.p.length, budget - used);
    if (length <= 0) break;
    chosen.add(item.index);
    used += length;
  }
  return scored
    .filter((s) => chosen.has(s.index))
    .map((s) => s.p)
    .join('\n')
    .slice(0, budget);
}
