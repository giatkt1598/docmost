import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { fetch as undiciFetch } from 'undici';
import type { Browser, Route } from 'playwright-core';
import { OutboundAgentFactory } from '../../outbound/outbound-agent.factory';
import { EnvironmentService } from '../../environment/environment.service';

const MAX_REDIRECTS = 5;
const PAGE_TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 10 * 1024 * 1024;
const MAX_RESOURCE_BYTES = 15 * 1024 * 1024;
const MAX_CONCURRENT_RENDERS = 2;
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Not worth downloading to read a page's text.
const SKIPPED_RESOURCES = [
  'image',
  'media',
  'font',
  'websocket',
  'eventsource',
  'manifest',
  'texttrack',
];
const HOP_BY_HOP = [
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
];

export class WebPageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'WebPageError';
  }
}

type SafeResponse = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  finalUrl: string;
};

export type FetchedWebPage = { html: string; finalUrl: string };

@Injectable()
export class WebPageFetcher implements OnModuleDestroy {
  private readonly logger = new Logger(WebPageFetcher.name);
  private browserPromise: Promise<Browser> | null = null;
  private activeRenders = 0;
  private renderQueue: (() => void)[] = [];

  constructor(
    private readonly agentFactory: OutboundAgentFactory,
    private readonly environmentService: EnvironmentService,
  ) {}

  isBrowserEnabled(): boolean {
    return this.environmentService.getWebImportBrowser() !== 'off';
  }

  /** Downloads the page HTML; every hop goes through the SSRF guard. */
  async fetchHtml(url: string): Promise<FetchedWebPage> {
    const res = await this.request(url, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      maxBytes: MAX_HTML_BYTES,
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'vi,en;q=0.8',
        'user-agent': BROWSER_USER_AGENT,
      },
    });

    if (res.status >= 400) {
      throw new WebPageError(`HTTP ${res.status}`, res.status);
    }

    const contentType = (res.headers['content-type'] ?? '').toLowerCase();
    const mimeType = contentType.split(';')[0].trim();
    if (mimeType && !HTML_TYPES.includes(mimeType)) {
      throw new WebPageError(`Not a web page (${mimeType})`);
    }

    return { html: decodeHtml(res.body, contentType), finalUrl: res.finalUrl };
  }

  /**
   * Loads the page in headless Chromium so client-rendered sites have content.
   * Chromium never touches the network itself: every request it makes is
   * answered by {@link request}, which applies the SSRF guard per hop.
   */
  async renderHtml(url: string): Promise<FetchedWebPage> {
    await this.acquireRenderSlot();
    const deadline = AbortSignal.timeout(PAGE_TIMEOUT_MS * 2);
    let finalUrl = url;
    let context: Awaited<ReturnType<Browser['newContext']>> | null = null;

    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        userAgent: BROWSER_USER_AGENT,
        locale: 'vi-VN',
        serviceWorkers: 'block',
        javaScriptEnabled: true,
        viewport: { width: 1280, height: 2000 },
      });

      await context.route('**/*', async (route: Route) => {
        const req = route.request();
        if (SKIPPED_RESOURCES.includes(req.resourceType())) {
          return route.abort('blockedbyclient').catch(() => undefined);
        }
        try {
          const headers = { ...req.headers() };
          for (const h of HOP_BY_HOP) delete headers[h];
          const res = await this.request(req.url(), {
            signal: deadline,
            maxBytes: MAX_RESOURCE_BYTES,
            method: req.method(),
            headers,
            body: req.postDataBuffer() ?? undefined,
          });
          if (req.isNavigationRequest() && !req.frame().parentFrame()) {
            finalUrl = res.finalUrl;
          }
          await route.fulfill({
            status: res.status,
            headers: res.headers,
            body: res.body,
          });
        } catch {
          await route.abort('blockedbyclient').catch(() => undefined);
        }
      });

      const page = await context.newPage();
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
      if (!response) throw new WebPageError('Could not load the page');
      if (response.status() >= 400) {
        throw new WebPageError(`HTTP ${response.status()}`, response.status());
      }

      await page
        .waitForLoadState('networkidle', { timeout: 8_000 })
        .catch(() => undefined);
      // nudge lazy loaders that wait for content to scroll into view
      await page
        .evaluate(async () => {
          for (
            let y = 0;
            y < document.body.scrollHeight && y < 30_000;
            y += 1500
          ) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 100));
          }
        })
        .catch(() => undefined);
      await page
        .waitForLoadState('networkidle', { timeout: 3_000 })
        .catch(() => undefined);

      return { html: await page.content(), finalUrl };
    } catch (err: any) {
      if (err instanceof WebPageError) throw err;
      this.logger.warn(`Rendering ${url} failed: ${err?.message ?? err}`);
      throw new WebPageError('Could not render the page');
    } finally {
      await context?.close().catch(() => undefined);
      this.releaseRenderSlot();
    }
  }

  async onModuleDestroy() {
    const browser = await this.browserPromise?.catch(() => null);
    await browser?.close().catch(() => undefined);
  }

  private async request(
    rawUrl: string,
    opts: {
      signal: AbortSignal;
      maxBytes: number;
      method?: string;
      headers?: Record<string, string>;
      body?: Buffer;
    },
  ): Promise<SafeResponse> {
    let url = rawUrl;
    let method = opts.method ?? 'GET';
    let body = opts.body;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let lease;
      try {
        // a fresh SSRF check and pinned connection for every hop
        lease = await this.agentFactory.lease(url);
      } catch (err: any) {
        throw new WebPageError(
          `${err?.retryable ? 'Request failed' : 'Blocked address'}: ${err?.message ?? err}`,
        );
      }

      try {
        let response;
        try {
          response = await undiciFetch(url, {
            dispatcher: lease.dispatcher,
            method,
            headers: opts.headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
            redirect: 'manual',
            signal: opts.signal,
          });
        } catch (err: any) {
          throw new WebPageError(
            `Request failed: ${err?.cause?.message ?? err?.message ?? err}`,
          );
        }

        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.status !== 304
        ) {
          const location = response.headers.get('location');
          void response.body?.cancel().catch(() => undefined);
          if (!location) throw new WebPageError('Redirect without location');
          url = new URL(location, url).toString();
          if (
            response.status === 303 ||
            ((response.status === 301 || response.status === 302) &&
              method === 'POST')
          ) {
            method = 'GET';
            body = undefined;
          }
          continue;
        }

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          // undici already decoded the body
          if (
            ![
              'content-encoding',
              'content-length',
              'transfer-encoding',
            ].includes(key)
          ) {
            headers[key] = value;
          }
        });

        return {
          status: response.status,
          headers,
          body: await readCapped(response, opts.maxBytes),
          finalUrl: url,
        };
      } finally {
        await lease.release().catch(() => undefined);
      }
    }

    throw new WebPageError('Too many redirects');
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser()
        .then((browser) => {
          browser.on('disconnected', () => {
            this.browserPromise = null;
          });
          return browser;
        })
        .catch((err) => {
          this.browserPromise = null;
          throw err;
        });
    }
    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    const { chromium } = await import('playwright-core');
    if (this.environmentService.getWebImportBrowser() === 'remote') {
      const endpoint = this.environmentService.getWebImportBrowserWsEndpoint();
      if (!endpoint) throw new Error('WEB_IMPORT_BROWSER_WS is not set');
      return chromium.connectOverCDP(endpoint, { timeout: PAGE_TIMEOUT_MS });
    }
    return chromium.launch({
      headless: true,
      executablePath:
        this.environmentService.getWebImportBrowserPath() || undefined,
    });
  }

  private async acquireRenderSlot() {
    if (this.activeRenders >= MAX_CONCURRENT_RENDERS) {
      await new Promise<void>((resolve) => this.renderQueue.push(resolve));
    }
    this.activeRenders++;
  }

  private releaseRenderSlot() {
    this.activeRenders--;
    this.renderQueue.shift()?.();
  }
}

async function readCapped(response: any, limit: number): Promise<Buffer> {
  const tooLarge = () => new WebPageError('The page is too large');
  if (Number(response.headers.get('content-length')) > limit) {
    void response.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  if (response.body) {
    const reader = response.body.getReader();
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
  }
  return Buffer.concat(chunks);
}

/** Decodes with the charset from the header, else a <meta> tag, else UTF-8. */
export function decodeHtml(body: Buffer, contentType: string): string {
  let charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    const head = body.subarray(0, 4096).toString('latin1');
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? undefined;
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}
