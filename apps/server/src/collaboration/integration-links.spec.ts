import { extractBrowseUrls } from './integration-links';

describe('extractBrowseUrls', () => {
  it('finds ticket addresses in smart links and link marks, once each and sorted', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'integrationCard', attrs: { url: 'https://sb.test/browse/SB-2', provider: 'sprint-boot' } },
        {
          type: 'paragraph',
          content: [
            { type: 'integrationMention', attrs: { url: 'https://sb.test/browse/SB-1', provider: 'sprint-boot' } },
            { type: 'text', text: 'again', marks: [{ type: 'link', attrs: { href: 'https://sb.test/browse/SB-2' } }] },
            { type: 'text', text: 'board', marks: [{ type: 'link', attrs: { href: 'https://sb.test/spaces/SB' } }] },
          ],
        },
      ],
    };

    expect(extractBrowseUrls(doc)).toEqual(['https://sb.test/browse/SB-1', 'https://sb.test/browse/SB-2']);
  });

  it('reads nothing from an empty page', () => {
    expect(extractBrowseUrls(null)).toEqual([]);
  });
});
