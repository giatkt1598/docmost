import {
  findExternalMedia,
  isAcceptedContentType,
  isExternalUrl,
} from './external-media.util';
import { pickFileName, withExtension } from './remote-file-fetcher.service';

const doc = (...content: any[]) => ({ type: 'doc', content });

describe('findExternalMedia', () => {
  it('finds external image, video, audio, pdf and attachment urls', () => {
    const result = findExternalMedia(
      doc(
        { type: 'image', attrs: { src: 'https://cdn.example.com/a.png' } },
        {
          type: 'callout',
          content: [
            { type: 'video', attrs: { src: 'http://example.com/v.mp4' } },
          ],
        },
        { type: 'audio', attrs: { src: 'https://example.com/a.mp3' } },
        { type: 'pdf', attrs: { src: 'https://example.com/d.pdf' } },
        { type: 'attachment', attrs: { url: 'https://example.com/f.zip' } },
      ),
    );
    expect(result).toEqual([
      { url: 'https://cdn.example.com/a.png', kind: 'image' },
      { url: 'http://example.com/v.mp4', kind: 'video' },
      { url: 'https://example.com/a.mp3', kind: 'audio' },
      { url: 'https://example.com/d.pdf', kind: 'file' },
      { url: 'https://example.com/f.zip', kind: 'file' },
    ]);
  });

  it('skips our own files, embeds, data urls and nodes with an attachment', () => {
    const result = findExternalMedia(
      doc(
        { type: 'image', attrs: { src: '/api/files/1/a.png' } },
        {
          type: 'image',
          attrs: { src: 'https://x.example/b.png', attachmentId: 'id-1' },
        },
        { type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } },
        {
          type: 'image',
          attrs: { src: 'http://localhost:3000/api/files/2/c.png' },
        },
        { type: 'embed', attrs: { src: 'https://www.youtube.com/watch?v=1' } },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'https://a.b/c.png' }],
        },
      ),
      'http://localhost:3000',
    );
    expect(result).toEqual([]);
  });

  it('lists a repeated url once', () => {
    const img = { type: 'image', attrs: { src: 'https://e.com/a.png' } };
    expect(findExternalMedia(doc(img, img))).toHaveLength(1);
  });

  it('copes with empty and malformed content', () => {
    expect(findExternalMedia(null)).toEqual([]);
    expect(findExternalMedia({ type: 'doc' })).toEqual([]);
    expect(isExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalUrl('not a url')).toBe(false);
  });
});

describe('isAcceptedContentType', () => {
  it('matches the node kind', () => {
    expect(isAcceptedContentType('image', 'image/webp')).toBe(true);
    expect(isAcceptedContentType('image', 'text/html; charset=utf-8')).toBe(
      false,
    );
    expect(isAcceptedContentType('video', 'video/mp4')).toBe(true);
    expect(isAcceptedContentType('video', 'image/png')).toBe(false);
    expect(isAcceptedContentType('file', 'application/zip')).toBe(true);
    expect(isAcceptedContentType('file', 'text/html')).toBe(false);
  });
});

describe('file names', () => {
  it('prefers content-disposition, then the url path', () => {
    expect(
      pickFileName('attachment; filename="report.pdf"', 'https://e.com/x'),
    ).toBe('report.pdf');
    expect(
      pickFileName(
        "attachment; filename*=UTF-8''b%C3%A1o%20c%C3%A1o.pdf",
        'https://e.com/x',
      ),
    ).toBe('báo_cáo.pdf');
    expect(pickFileName(null, 'https://e.com/img/cat%20photo.jpg?w=200')).toBe(
      'cat_photo.jpg',
    );
    expect(pickFileName(null, 'https://e.com/')).toBe('file');
    expect(
      pickFileName('attachment; filename="../../etc/passwd"', 'https://e.com'),
    ).toBe('passwd');
  });

  it('adds an extension that matches the content type', () => {
    expect(withExtension('image', 'image/png')).toBe('image.png');
    expect(withExtension('photo.php', 'image/png')).toBe('photo.png');
    expect(withExtension('a.jpg', 'image/jpeg')).toBe('a.jpg');
    expect(withExtension('clip.mp4', 'video/mp4')).toBe('clip.mp4');
  });
});
