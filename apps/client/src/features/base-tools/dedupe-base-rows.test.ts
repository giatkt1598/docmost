import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { dedupeRowPages, installBaseRowDedupe } from "./dedupe-base-rows";

const pages = (...lists: string[][]) => ({
  pageParams: lists.map(() => undefined),
  pages: lists.map((ids) => ({ items: ids.map((id) => ({ id })) })),
});

describe("dedupeRowPages", () => {
  it("keeps the first copy of a repeated row, across pages", () => {
    const out = dedupeRowPages(pages(["a", "b"], ["c", "b", "c"]));
    expect(out?.pages.map((p) => p.items.map((r) => r.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("returns null when there is nothing to remove", () => {
    expect(dedupeRowPages(pages(["a"], ["b"]))).toBeNull();
    expect(dedupeRowPages(undefined)).toBeNull();
  });
});

describe("installBaseRowDedupe", () => {
  it("cleans base row lists written to the cache, and nothing else", async () => {
    const client = new QueryClient();
    installBaseRowDedupe(client);
    client.setQueryData(["base-rows", "p1"], pages(["a", "b", "a"]));
    client.setQueryData(["other", "p1"], pages(["a", "a"]));
    await Promise.resolve();
    await Promise.resolve();
    const rows = client.getQueryData<any>(["base-rows", "p1"]);
    expect(rows.pages[0].items.map((r: any) => r.id)).toEqual(["a", "b"]);
    const other = client.getQueryData<any>(["other", "p1"]);
    expect(other.pages[0].items).toHaveLength(2);
  });
});
