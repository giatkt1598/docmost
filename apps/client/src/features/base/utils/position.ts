import { generateJitteredKeyBetween } from "fractional-indexing-jittered";

// Positions are fractional-indexing keys sorted byte-wise on the server
// (collate "C"). Keys are ASCII, so a plain code unit comparison matches.
export function comparePositions(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function sortByPosition<T extends { position: string; id: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) => comparePositions(a.position, b.position) || comparePositions(a.id, b.id),
  );
}

// A new key between two neighbours (null = open end).
export function positionBetween(
  before: string | null | undefined,
  after: string | null | undefined,
): string {
  return generateJitteredKeyBetween(before ?? null, after ?? null);
}
