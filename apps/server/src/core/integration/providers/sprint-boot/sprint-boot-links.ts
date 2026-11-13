import { TICKET_KEY } from './sprint-boot-patterns';

const BROWSE = new RegExp(`\\/browse\\/${TICKET_KEY}(?![A-Za-z0-9])`);

// Every Sprint Boot ticket address a page holds: smart links of the provider, and plain links to its host.
export function extractSprintBootUrls(content: unknown, baseUrl: string): string[] {
  const host = hostOf(baseUrl);
  const urls = new Set<string>();

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const attrs = node.attrs ?? {};
    if (
      (node.type === 'integrationMention' || node.type === 'integrationCard') &&
      typeof attrs.url === 'string' &&
      (attrs.provider === 'sprint-boot' || hostOf(attrs.url) === host)
    ) {
      urls.add(attrs.url);
    }
    for (const mark of node.marks ?? []) {
      const href = mark?.attrs?.href;
      if (mark?.type === 'link' && typeof href === 'string' && hostOf(href) === host) {
        urls.add(href);
      }
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(content);

  return [...urls].filter((url) => BROWSE.test(url));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}
