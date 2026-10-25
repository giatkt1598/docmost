import { describe, expect, it } from "vitest";
import { createRequestId, isOwnRequestId, RequestIdRegistry } from "./request-id";

describe("RequestIdRegistry", () => {
  it("recognises ids it created and nothing else", () => {
    const reg = new RequestIdRegistry();
    const id = reg.create();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(reg.isOwn(id)).toBe(true);
    expect(reg.isOwn("someone-else")).toBe(false);
    expect(reg.isOwn(null)).toBe(false);
    expect(reg.isOwn(undefined)).toBe(false);
    expect(reg.isOwn("")).toBe(false);
  });

  it("forgets ids after the TTL", () => {
    let now = 1000;
    const reg = new RequestIdRegistry(() => now, 10, 500);
    const id = reg.create();
    now += 499;
    expect(reg.isOwn(id)).toBe(true);
    now += 2;
    expect(reg.isOwn(id)).toBe(false);
  });

  it("keeps only the most recent ids", () => {
    const reg = new RequestIdRegistry(() => 0, 3);
    const first = reg.create();
    const kept = [reg.create(), reg.create(), reg.create()];
    expect(reg.isOwn(first)).toBe(false);
    expect(kept.every((id) => reg.isOwn(id))).toBe(true);
  });

  it("shares one registry through the module helpers", () => {
    const id = createRequestId();
    expect(isOwnRequestId(id)).toBe(true);
    expect(isOwnRequestId(createRequestId() + "x")).toBe(false);
  });
});
