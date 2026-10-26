import { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Base } from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";
import { useViewFullWidth } from "./use-view-full-width";

const view = (id: string, position: string, fullWidth?: boolean) => ({
  id,
  position,
  name: id,
  type: "table",
  config: fullWidth === undefined ? {} : { fullWidth },
});

function setup(url: string, embedded: boolean, views = [view("a", "a0", true), view("b", "a1")]) {
  const qc = new QueryClient();
  qc.setQueryData(baseKeys.info("base"), { id: "base", properties: [], views } as unknown as Base);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { qc, ...renderHook(() => useViewFullWidth("base", embedded), { wrapper }) };
}

describe("useViewFullWidth", () => {
  it("knows the setting of the active view on the first render (page)", () => {
    expect(setup("/base/base", false).result.current.fullWidth).toBe(true);
    expect(setup("/base/base?view=a", false).result.current.fullWidth).toBe(true);
    expect(setup("/base/base?view=b", false).result.current.fullWidth).toBe(false);
    expect(setup("/base/base?view=gone", false).result.current.fullWidth).toBe(true);
  });

  it("follows the cache when the setting changes", async () => {
    const { qc, result } = setup("/base/base?view=b", false);
    expect(result.current.fullWidth).toBe(false);
    act(() => {
      qc.setQueryData(baseKeys.info("base"), {
        id: "base",
        properties: [],
        views: [view("a", "a0", true), view("b", "a1", true)],
      } as unknown as Base);
    });
    await waitFor(() => expect(result.current.fullWidth).toBe(true));
  });

  it("starts from the first view in an embed, then takes what the workspace reports", () => {
    const { result } = setup("/page", true);
    expect(result.current.fullWidth).toBe(true);
    act(() => result.current.onFullWidthChange(false));
    expect(result.current.fullWidth).toBe(false);
    act(() => result.current.onFullWidthChange(true));
    expect(result.current.fullWidth).toBe(true);
  });

  it("ignores ?view= in an embed (several embeds share one URL)", () => {
    expect(setup("/page?view=b", true).result.current.fullWidth).toBe(true);
  });

  it("is off without a base", () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useViewFullWidth(undefined, false), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      ),
    });
    expect(result.current.fullWidth).toBe(false);
  });
});
