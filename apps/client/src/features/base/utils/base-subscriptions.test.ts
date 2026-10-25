import { describe, expect, it, vi } from "vitest";
import { BaseSubscriptionManager, subscriptionManagerFor } from "./base-subscriptions";

function fakeSocket() {
  const listeners = new Map<string, Set<(...a: any[]) => void>>();
  const emitted: Array<[string, any]> = [];
  return {
    emitted,
    listenerCount: (ev: string) => listeners.get(ev)?.size ?? 0,
    fire: (ev: string, payload?: unknown) =>
      listeners.get(ev)?.forEach((l) => l(payload)),
    emit: (ev: string, payload: unknown) => {
      emitted.push([ev, payload]);
    },
    on: (ev: string, l: (...a: any[]) => void) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(l);
    },
    off: (ev: string, l: (...a: any[]) => void) => {
      listeners.get(ev)?.delete(l);
    },
  };
}

const ops = (s: ReturnType<typeof fakeSocket>) =>
  s.emitted.map(([, p]) => `${p.operation}:${p.pageId}`);

describe("BaseSubscriptionManager", () => {
  it("subscribes once and unsubscribes after the last release", () => {
    const socket = fakeSocket();
    const m = new BaseSubscriptionManager(socket);
    const r1 = m.acquire("b1", { onEvent: vi.fn() });
    const r2 = m.acquire("b1", { onEvent: vi.fn() });
    expect(ops(socket)).toEqual(["base:subscribe:b1"]);
    expect(m.subscriberCount("b1")).toBe(2);
    r1();
    r1(); // double release is ignored
    expect(ops(socket)).toEqual(["base:subscribe:b1"]);
    r2();
    expect(ops(socket)).toEqual(["base:subscribe:b1", "base:unsubscribe:b1"]);
    expect(socket.listenerCount("message")).toBe(0);
    expect(socket.listenerCount("connect")).toBe(0);
  });

  it("routes events to the base they belong to, once", () => {
    const socket = fakeSocket();
    const m = new BaseSubscriptionManager(socket);
    const h1 = vi.fn();
    const h2 = vi.fn();
    m.acquire("b1", { onEvent: h1 });
    m.acquire("b1", { onEvent: vi.fn() });
    m.acquire("b2", { onEvent: h2 });
    expect(socket.listenerCount("message")).toBe(1);

    socket.fire("message", { operation: "base:row:deleted", pageId: "b1", rowId: "r" });
    socket.fire("message", { operation: "base:row:deleted", pageId: "b3", rowId: "r" });
    socket.fire("message", { operation: "commentCreated", pageId: "b1" });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).not.toHaveBeenCalled();
  });

  it("resubscribes after a reconnection", () => {
    const socket = fakeSocket();
    const m = new BaseSubscriptionManager(socket);
    const onReconnect = vi.fn();
    m.acquire("b1", { onEvent: vi.fn(), onReconnect });
    socket.fire("connect");
    expect(ops(socket)).toEqual(["base:subscribe:b1", "base:subscribe:b1"]);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps one manager per socket", () => {
    const socket = fakeSocket();
    expect(subscriptionManagerFor(socket)).toBe(subscriptionManagerFor(socket));
    expect(subscriptionManagerFor(fakeSocket())).not.toBe(subscriptionManagerFor(socket));
  });
});
