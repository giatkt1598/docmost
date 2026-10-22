import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Agent } from 'undici';
import {
  RemoteFileError,
  RemoteFileFetcher,
} from './remote-file-fetcher.service';
import { OutboundUrlError } from '../../integrations/outbound/outbound-url.guard';

const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');

describe('RemoteFileFetcher', () => {
  let server: Server;
  let base: string;
  const blocked = new Set<string>();

  const agentFactory = {
    lease: jest.fn(async (url: string) => {
      if (blocked.has(new URL(url).pathname)) {
        throw new OutboundUrlError('resolves to a private address');
      }
      const agent = new Agent();
      return { dispatcher: agent, release: () => agent.close() };
    }),
  };
  const env = { getFileUploadSizeLimit: () => '1kb' };
  const fetcher = new RemoteFileFetcher(agentFactory as any, env as any);

  beforeAll(async () => {
    server = createServer((req, res) => {
      switch (req.url) {
        case '/a.png':
          res.writeHead(200, { 'content-type': 'image/png' });
          return res.end(PNG);
        case '/noext':
          res.writeHead(200, { 'content-type': 'image/png' });
          return res.end(PNG);
        case '/octet.mp4':
          res.writeHead(200, { 'content-type': 'application/octet-stream' });
          return res.end(PNG);
        case '/page':
          res.writeHead(200, { 'content-type': 'text/html' });
          return res.end('<html></html>');
        case '/big':
          res.writeHead(200, { 'content-type': 'image/png' });
          return res.end(Buffer.alloc(4096));
        case '/hop':
          res.writeHead(302, { location: '/a.png' });
          return res.end();
        case '/to-internal':
          res.writeHead(302, { location: '/internal' });
          return res.end();
        case '/loop':
          res.writeHead(302, { location: '/loop' });
          return res.end();
        case '/oops':
          res.writeHead(503);
          return res.end();
        default:
          res.writeHead(404);
          return res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    blocked.add('/internal');
  });

  afterAll(() => new Promise((r) => server.close(r)));

  it('downloads a file and names it', async () => {
    const file = await fetcher.fetch(`${base}/a.png`, 'image');
    expect(file.buffer.equals(PNG)).toBe(true);
    expect(file).toMatchObject({
      fileName: 'a.png',
      fileExtension: '.png',
      mimeType: 'image/png',
    });
  });

  it('adds an extension and trusts the name for generic types', async () => {
    expect((await fetcher.fetch(`${base}/noext`, 'image')).fileName).toBe(
      'noext.png',
    );
    expect(await fetcher.fetch(`${base}/octet.mp4`, 'video')).toMatchObject({
      fileName: 'octet.mp4',
      mimeType: 'video/mp4',
    });
  });

  it('follows redirects and checks every hop', async () => {
    expect((await fetcher.fetch(`${base}/hop`, 'image')).fileName).toBe(
      'a.png',
    );
    await expect(fetcher.fetch(`${base}/to-internal`, 'image')).rejects.toThrow(
      /private address/,
    );
    await expect(fetcher.fetch(`${base}/loop`, 'image')).rejects.toThrow(
      /Too many redirects/,
    );
  });

  it('refuses the wrong type, oversized files and errors', async () => {
    await expect(fetcher.fetch(`${base}/page`, 'image')).rejects.toThrow(
      /Unexpected content type/,
    );
    await expect(fetcher.fetch(`${base}/big`, 'image')).rejects.toThrow(
      /larger than/,
    );
    const notFound = await fetcher
      .fetch(`${base}/missing`, 'image')
      .catch((e) => e);
    expect(notFound).toBeInstanceOf(RemoteFileError);
    expect(notFound.retryable).toBe(false);
    const unavailable = await fetcher
      .fetch(`${base}/oops`, 'image')
      .catch((e) => e);
    expect(unavailable.retryable).toBe(true);
  });
});
