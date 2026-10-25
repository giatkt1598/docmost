import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api-client", () => ({ default: { post: (...a: unknown[]) => post(...a) } }));
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

import { basesApi, ROWS_PAGE_SIZE } from "./bases-api";

describe("basesApi", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { ok: true } });
  });

  const lastCall = () => post.mock.calls[post.mock.calls.length - 1];

  it("unwraps the response envelope", async () => {
    await expect(basesApi.base.info("p1")).resolves.toEqual({ ok: true });
    expect(lastCall()).toEqual(["/bases/info", { pageId: "p1" }, undefined]);
  });

  it("sends normalized row queries with the page size", async () => {
    await basesApi.rows.list("p1", { sorts: [], search: " hi ", filter: { op: "and", children: [] } });
    expect(lastCall()[0]).toBe("/bases/rows");
    expect(lastCall()[1]).toEqual({ pageId: "p1", search: "hi", limit: ROWS_PAGE_SIZE });
    await basesApi.rows.list("p1", {}, "cur");
    expect(lastCall()[1]).toEqual({ pageId: "p1", cursor: "cur", limit: ROWS_PAGE_SIZE });
  });

  it("builds write bodies the server DTOs expect", async () => {
    await basesApi.rows.update("p1", "r1", { cells: { a: 1 } }, "req");
    expect(lastCall().slice(0, 2)).toEqual([
      "/bases/rows/update",
      { pageId: "p1", rowId: "r1", cells: { a: 1 }, requestId: "req" },
    ]);
    await basesApi.rows.removeMany("p1", ["r1", "r2"]);
    expect(lastCall().slice(0, 2)).toEqual([
      "/bases/rows/delete-many",
      { pageId: "p1", rowIds: ["r1", "r2"] },
    ]);
    await basesApi.properties.update("p1", "prop", { name: "N" }, "req");
    expect(lastCall()[1]).toEqual({ pageId: "p1", propertyId: "prop", name: "N", requestId: "req" });
    await basesApi.views.update("p1", "v1", { config: { sorts: null } });
    expect(lastCall().slice(0, 2)).toEqual([
      "/bases/views/update",
      { pageId: "p1", viewId: "v1", config: { sorts: null } },
    ]);
    await basesApi.base.convert("p1");
    expect(lastCall().slice(0, 2)).toEqual(["/bases/convert", { pageId: "p1" }]);
  });

  it("puts multipart fields before the file", async () => {
    const file = new File(["a,b"], "x.csv");
    await basesApi.base.importCsv("p1", file, true);
    const form = lastCall()[1] as FormData;
    expect([...form.keys()]).toEqual(["pageId", "createMissing", "file"]);
    expect(form.get("createMissing")).toBe("true");
  });

  it("passes public access with the public endpoints", async () => {
    await basesApi.publicView.rows("p1", { shareId: "s1" });
    expect(lastCall().slice(0, 2)).toEqual([
      "/bases/public/rows",
      { pageId: "p1", shareId: "s1", limit: ROWS_PAGE_SIZE },
    ]);
  });

  it("returns the expanded pages list", async () => {
    post.mockResolvedValue({ data: { items: [{ id: "x" }] } });
    await expect(basesApi.base.expandPages(["x"])).resolves.toEqual([{ id: "x" }]);
  });
});
