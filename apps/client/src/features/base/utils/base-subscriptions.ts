import { BaseRealtimeEvent } from "@/features/base/types/base.types";

// Reference-counted base:subscribe / base:unsubscribe over one socket.
// Several components may show the same base (page, embeds, row modal); the
// first one subscribes, the last one unsubscribes, and events are handled
// once per base whatever the number of components.

export type SocketLike = {
  emit: (event: string, payload: unknown) => unknown;
  on: (event: string, listener: (...args: any[]) => void) => unknown;
  off: (event: string, listener: (...args: any[]) => void) => unknown;
};

export type BaseSubscriptionHandlers = {
  onEvent: (event: BaseRealtimeEvent) => void;
  // the socket reconnected: events may have been missed meanwhile
  onReconnect?: () => void;
};

type Entry = { count: number; handlers: BaseSubscriptionHandlers };

export class BaseSubscriptionManager {
  private readonly entries = new Map<string, Entry>();
  private listening = false;

  constructor(private readonly socket: SocketLike) {}

  private readonly onMessage = (data: any) => {
    const op = data?.operation;
    if (typeof op !== "string" || !op.startsWith("base:")) return;
    const entry = this.entries.get(data.pageId);
    if (entry) entry.handlers.onEvent(data as BaseRealtimeEvent);
  };

  private readonly onConnect = () => {
    for (const [pageId, entry] of this.entries) {
      this.socket.emit("message", { operation: "base:subscribe", pageId });
      entry.handlers.onReconnect?.();
    }
  };

  private startListening() {
    if (this.listening) return;
    this.socket.on("message", this.onMessage);
    // socket.io fires "connect" again after a reconnection
    this.socket.on("connect", this.onConnect);
    this.listening = true;
  }

  private stopListening() {
    if (!this.listening) return;
    this.socket.off("message", this.onMessage);
    this.socket.off("connect", this.onConnect);
    this.listening = false;
  }

  // Returns the release function. Calling it more than once is harmless.
  acquire(pageId: string, handlers: BaseSubscriptionHandlers): () => void {
    const entry = this.entries.get(pageId);
    if (entry) {
      entry.count++;
    } else {
      this.entries.set(pageId, { count: 1, handlers });
      this.startListening();
      this.socket.emit("message", { operation: "base:subscribe", pageId });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release(pageId);
    };
  }

  private release(pageId: string) {
    const entry = this.entries.get(pageId);
    if (!entry) return;
    entry.count--;
    if (entry.count > 0) return;
    this.entries.delete(pageId);
    this.socket.emit("message", { operation: "base:unsubscribe", pageId });
    if (this.entries.size === 0) this.stopListening();
  }

  subscriberCount(pageId: string): number {
    return this.entries.get(pageId)?.count ?? 0;
  }
}

const managers = new WeakMap<object, BaseSubscriptionManager>();

export function subscriptionManagerFor(socket: SocketLike): BaseSubscriptionManager {
  let m = managers.get(socket);
  if (!m) {
    m = new BaseSubscriptionManager(socket);
    managers.set(socket, m);
  }
  return m;
}
