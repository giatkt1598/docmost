// Finds media in ProseMirror JSON that still points at another site, so the
// file can be copied into our own storage before the link dies.

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

// node type -> attribute holding the file URL, and what content it may hold
export const LOCALIZABLE_NODES: Record<
  string,
  { attr: string; kind: MediaKind }
> = {
  image: { attr: 'src', kind: 'image' },
  video: { attr: 'src', kind: 'video' },
  audio: { attr: 'src', kind: 'audio' },
  pdf: { attr: 'src', kind: 'file' },
  attachment: { attr: 'url', kind: 'file' },
};

export type ExternalMedia = { url: string; kind: MediaKind };

export function isExternalUrl(
  value: unknown,
  appUrl?: string,
): value is string {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (appUrl) {
    try {
      if (url.origin === new URL(appUrl).origin) return false;
    } catch {
      // ignore a malformed APP_URL
    }
  }
  return true;
}

// Unique external URLs in document order. Nodes that already have an
// attachmentId are ours, whatever their src says.
export function findExternalMedia(doc: any, appUrl?: string): ExternalMedia[] {
  const found = new Map<string, ExternalMedia>();

  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const spec = LOCALIZABLE_NODES[node.type];
    if (spec) {
      const value = node.attrs?.[spec.attr];
      if (!node.attrs?.attachmentId && isExternalUrl(value, appUrl)) {
        if (!found.has(value))
          found.set(value, { url: value, kind: spec.kind });
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };

  walk(doc);
  return [...found.values()];
}

export function hasExternalMedia(doc: any, appUrl?: string): boolean {
  return findExternalMedia(doc, appUrl).length > 0;
}

// Whether the response's content type fits the node it will be shown in.
export function isAcceptedContentType(kind: MediaKind, contentType: string) {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  switch (kind) {
    case 'image':
      return type.startsWith('image/');
    case 'video':
      return type.startsWith('video/');
    case 'audio':
      return type.startsWith('audio/');
    case 'file':
      // an HTML page is a dead link or a login wall, not the file
      return type !== 'text/html' && type !== 'application/xhtml+xml';
  }
}
