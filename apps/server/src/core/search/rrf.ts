// Reciprocal rank fusion: merges several ranked id lists into one. An id
// scores 1 / (k + rank) in every list it appears in; lists never need to
// share a score scale, which is why it suits keyword plus vector results.
export function fuseRankings(lists: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
