import { Injectable } from '@nestjs/common';
import { fetch as undiciFetch } from 'undici';
import * as mime from 'mime-types';
import * as path from 'node:path';
import * as bytes from 'bytes';
import { OutboundAgentFactory } from '../../integrations/outbound/outbound-agent.factory';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { sanitizeFileName } from '../../common/helpers';
import { isAcceptedContentType, MediaKind } from './external-media.util';

const MAX_REDIRECTS = 3;
const TOTAL_TIMEOUT_MS = 60_000;
const GENERIC_TYPES = ['', 'application/octet-stream', 'binary/octet-stream'];

export type RemoteFile = {
  buffer: Buffer;
  fileName: string;
  fileExtension: string;
  mimeType: string;
};

// The file is unusable (wrong type, too big, blocked, 4xx); retrying won't help.
export class RemoteFileError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'RemoteFileError';
  }
}

@Injectable()
export class RemoteFileFetcher {
  constructor(
    private readonly agentFactory: OutboundAgentFactory,
    private readonly environmentService: EnvironmentService,
  ) {}

  maxBytes(): number {
    return bytes(this.environmentService.getFileUploadSizeLimit());
  }

  async fetch(rawUrl: string, kind: MediaKind): Promise<RemoteFile> {
    const deadline = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
    let url = rawUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // a fresh SSRF check and pinned connection for every hop
      let lease;
      try {
        lease = await this.agentFactory.lease(url);
      } catch (err: any) {
        throw new RemoteFileError(err?.message ?? String(err), err?.retryable);
      }

      try {
        let response;
        try {
          response = await undiciFetch(url, {
            dispatcher: lease.dispatcher,
            redirect: 'manual',
            signal: deadline,
            headers: { accept: acceptHeader(kind), 'user-agent': 'Docmost' },
          });
        } catch (err: any) {
          throw new RemoteFileError(
            `Request failed: ${err?.cause?.message ?? err?.message ?? err}`,
            true,
          );
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          void response.body?.cancel().catch(() => undefined);
          if (!location) throw new RemoteFileError('Redirect without location');
          url = new URL(location, url).toString();
          continue;
        }

        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          throw new RemoteFileError(
            `HTTP ${response.status}`,
            response.status === 429 || response.status >= 500,
          );
        }

        const fileName = pickFileName(
          response.headers.get('content-disposition'),
          url,
        );
        const headerType = (response.headers.get('content-type') ?? '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        const mimeType = GENERIC_TYPES.includes(headerType)
          ? mime.lookup(fileName) || headerType || 'application/octet-stream'
          : headerType;

        if (!isAcceptedContentType(kind, mimeType)) {
          void response.body?.cancel().catch(() => undefined);
          throw new RemoteFileError(`Unexpected content type "${mimeType}"`);
        }

        const buffer = await this.readCapped(response);
        const named = withExtension(fileName, mimeType);
        return {
          buffer,
          fileName: named,
          fileExtension: path.extname(named).toLowerCase(),
          mimeType,
        };
      } finally {
        await lease.release().catch(() => undefined);
      }
    }

    throw new RemoteFileError('Too many redirects');
  }

  private async readCapped(response: any): Promise<Buffer> {
    const limit = this.maxBytes();
    const tooLarge = () =>
      new RemoteFileError(`File is larger than ${bytes(limit)}`);

    if (Number(response.headers.get('content-length')) > limit) {
      void response.body?.cancel().catch(() => undefined);
      throw tooLarge();
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > limit) {
            void reader.cancel().catch(() => undefined);
            throw tooLarge();
          }
          chunks.push(value);
        }
      } catch (err) {
        if (err instanceof RemoteFileError) throw err;
        throw new RemoteFileError(`Download failed: ${err}`, true);
      }
    }
    if (received === 0) throw new RemoteFileError('Empty file');
    return Buffer.concat(chunks);
  }
}

function acceptHeader(kind: MediaKind): string {
  if (kind === 'file') return '*/*';
  return `${kind}/*,*/*;q=0.5`;
}

export function pickFileName(disposition: string | null, url: string): string {
  let name = '';
  if (disposition) {
    const star = /filename\*\s*=\s*(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
    try {
      name = star ? decodeURIComponent(star[1]) : (plain?.[1] ?? '');
    } catch {
      name = plain?.[1] ?? '';
    }
  }
  if (!name) {
    try {
      const last = new URL(url).pathname.split('/').filter(Boolean).pop();
      name = last ? decodeURIComponent(last) : '';
    } catch {
      name = '';
    }
  }
  name = sanitizeFileName(path.basename(name.trim())).slice(0, 200);
  return name || 'file';
}

// Adds an extension matching the content type when the name has none (or a
// misleading one, e.g. "photo.php" serving image/png).
export function withExtension(fileName: string, mimeType: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const fromName = ext ? mime.lookup(ext) : false;
  if (fromName && fromName === mimeType) return fileName;
  const wanted = mime.extension(mimeType);
  if (!wanted) return fileName;
  if (fromName && fromName.split('/')[0] === mimeType.split('/')[0]) {
    return fileName; // .jpg vs image/jpeg variants and the like
  }
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  return `${base || 'file'}.${wanted}`;
}
