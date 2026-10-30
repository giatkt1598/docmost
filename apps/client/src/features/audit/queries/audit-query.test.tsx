import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuditLogsQuery } from "@/features/audit/queries/audit-query";
import { getAuditLogs } from "@/features/audit/services/audit-service";

vi.mock("@/features/audit/services/audit-service", () => ({
  getAuditLogs: vi.fn(),
  getAuditRetention: vi.fn(),
  saveAuditRetention: vi.fn(),
}));

describe("useAuditLogsQuery", () => {
  it("loads new events when the page is opened again", async () => {
    const fetchLogs = vi.mocked(getAuditLogs);
    fetchLogs.mockResolvedValueOnce({ items: [{ id: "old" }] } as any);
    fetchLogs.mockResolvedValueOnce({ items: [{ id: "new" }] } as any);

    // same defaults as the app's query client
    const client = new QueryClient({
      defaultOptions: {
        queries: { refetchOnMount: false, staleTime: 5 * 60 * 1000 },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(() => useAuditLogsQuery({ limit: 50 }), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();

    const second = renderHook(() => useAuditLogsQuery({ limit: 50 }), {
      wrapper,
    });
    await waitFor(() =>
      expect(second.result.current.data?.items[0].id).toBe("new"),
    );
    expect(fetchLogs).toHaveBeenCalledTimes(2);
  });
});
