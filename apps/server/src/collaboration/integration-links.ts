// Ticket addresses (/browse/KEY-12) a page holds, in smart links and in link marks. The collab server cannot tell
// which host is an integration's, so it keeps every such address and the integration filters by its own host.
const BROWSE = /\/browse\/[A-Za-z][A-Za-z0-9]{1,9}-[1-9][0-9]*(?![A-Za-z0-9])/;

export function extractBrowseUrls(content: unknown): string[] {
  const urls = new Set<string>();
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const url = node.attrs?.url;
    if (
      (node.type === 'integrationMention' || node.type === 'integrationCard') &&
      typeof url === 'string' &&
      BROWSE.test(url)
    ) {
      urls.add(url);
    }
    for (const mark of node.marks ?? []) {
      const href = mark?.attrs?.href;
      if (mark?.type === 'link' && typeof href === 'string' && BROWSE.test(href)) {
        urls.add(href);
      }
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(content);
  return [...urls].sort();
}
