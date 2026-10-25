import { v4 as uuidv4 } from "uuid";

// Every write the client sends carries a requestId; the server copies it into
// the socket event the write causes. Remembering the ids we sent lets the
// realtime hook drop the echoes of our own changes, which the mutation has
// already applied to the cache.

const MAX_REMEMBERED = 1000;
const TTL_MS = 5 * 60 * 1000;

export class RequestIdRegistry {
  private readonly sent = new Map<string, number>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly maxSize = MAX_REMEMBERED,
    private readonly ttlMs = TTL_MS,
  ) {}

  // A new id, remembered as ours.
  create(): string {
    const id = uuidv4();
    this.remember(id);
    return id;
  }

  remember(id: string): void {
    this.sent.delete(id);
    this.sent.set(id, this.now());
    // Map keeps insertion order: the first keys are the oldest
    while (this.sent.size > this.maxSize) {
      const oldest = this.sent.keys().next().value as string;
      this.sent.delete(oldest);
    }
  }

  isOwn(id: string | null | undefined): boolean {
    if (!id) return false;
    const at = this.sent.get(id);
    if (at === undefined) return false;
    if (this.now() - at > this.ttlMs) {
      this.sent.delete(id);
      return false;
    }
    return true;
  }

  clear(): void {
    this.sent.clear();
  }
}

export const requestIds = new RequestIdRegistry();

export const createRequestId = () => requestIds.create();
export const isOwnRequestId = (id: string | null | undefined) =>
  requestIds.isOwn(id);
