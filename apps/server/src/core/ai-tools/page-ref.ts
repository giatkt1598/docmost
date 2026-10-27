import { isUUID } from 'class-validator';

// What people and models paste as "the page": an id, a slug id, the URL slug
// (title words + slug id) or the whole page URL. Returns what PageRepo
// looks up: the UUID or the slug id.
export function normalizePageRef(value: string): string {
  let ref = (value ?? '').trim();
  if (!ref || isUUID(ref)) return ref;
  // a URL or path: keep the part after /p/
  const pathMatch = /\/p\/([^/?#\s]+)/.exec(ref);
  if (pathMatch) ref = decodeURIComponent(pathMatch[1]);
  // "codex-mcp-mk9C3UWqG7": the slug id is the part after the last dash
  if (ref.includes('-') && !isUUID(ref)) {
    ref = ref.slice(ref.lastIndexOf('-') + 1);
  }
  return ref;
}
