import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

// Checks Mermaid syntax with the same mermaid version the editor renders,
// so a model hears about a broken diagram instead of the reader seeing it.
// Mermaid needs a DOM, so it runs in a worker with a happy-dom window; the
// server's own globals stay untouched. When the worker cannot start or a
// check takes too long the source is let through: the editor still shows
// its own error then.

const TIMEOUT_MS = 5000;

const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { Window } = require(workerData.happyDom);
const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
const ready = import(workerData.mermaid).then(({ default: mermaid }) => {
  mermaid.initialize({ startOnLoad: false });
  return mermaid;
});
parentPort.on('message', async ({ id, source }) => {
  try {
    const mermaid = await ready;
    const result = await mermaid.parse(source);
    parentPort.postMessage({ id, ok: true, type: result && result.diagramType });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
});
`;

// ok: null when the check could not run
export type MermaidCheck = {
  ok: boolean | null;
  type?: string;
  error?: string;
};

@Injectable()
export class MermaidValidator implements OnModuleDestroy {
  private readonly logger = new Logger(MermaidValidator.name);
  private worker: Worker | null = null;
  private unavailable = false;
  private nextId = 0;
  private readonly pending = new Map<number, (r: MermaidCheck) => void>();

  async check(source: string): Promise<MermaidCheck> {
    const worker = this.start();
    if (!worker) return { ok: null };
    const id = this.nextId++;
    return new Promise<MermaidCheck>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: null });
      }, TIMEOUT_MS);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      worker.postMessage({ id, source });
    });
  }

  // The parse error trimmed to what helps: message and the pointed line.
  static describe(error: string): string {
    return error
      .split('\n')
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .slice(0, 4)
      .join(' | ')
      .slice(0, 500);
  }

  onModuleDestroy() {
    void this.worker?.terminate();
    this.worker = null;
  }

  private start(): Worker | null {
    if (this.worker) return this.worker;
    if (this.unavailable) return null;
    try {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: {
          happyDom: require.resolve('happy-dom'),
          mermaid: pathToFileURL(require.resolve('mermaid')).href,
        },
      });
      worker.unref();
      worker.on('message', ({ id, ...result }) => {
        this.pending.get(id)?.(result as MermaidCheck);
        this.pending.delete(id);
      });
      worker.on('error', (err) => this.fail(err as Error));
      worker.on('exit', () => {
        if (this.worker === worker) this.worker = null;
        for (const resolve of this.pending.values()) resolve({ ok: null });
        this.pending.clear();
      });
      this.worker = worker;
      return worker;
    } catch (err) {
      this.fail(err as Error);
      return null;
    }
  }

  private fail(err: Error) {
    this.logger.warn(`Mermaid checks are off: ${err.message}`);
    this.unavailable = true;
    void this.worker?.terminate();
    this.worker = null;
  }
}
