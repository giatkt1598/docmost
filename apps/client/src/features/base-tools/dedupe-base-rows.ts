import type { InfiniteData, QueryClient } from "@tanstack/react-query";

type RowsPage = { items: { id: string }[] };

let installed = false;

// Removes repeated rows (same id) from a cached row list. Returns null when
// there is nothing to remove.
export function dedupeRowPages<T extends RowsPage>(
  data: InfiniteData<T> | undefined,
): InfiniteData<T> | null {
  if (!data?.pages) return null;
  const seen = new Set<string>();
  let removed = false;
  const pages = data.pages.map((page) => {
    if (!Array.isArray(page?.items)) return page;
    const items = page.items.filter((row) => {
      if (!row?.id) return true;
      if (seen.has(row.id)) {
        removed = true;
        return false;
      }
      seen.add(row.id);
      return true;
    });
    return items.length === page.items.length ? page : { ...page, items };
  });
  return removed ? { ...data, pages } : null;
}

/**
 * A base row could show up twice when a slow "New row" request finished
 * after a row-list refetch that already had the new row: the base code then
 * appended it again. This watches the cached row lists ("base-rows" queries)
 * and drops repeated ids, without touching the base code itself.
 */
export function installBaseRowDedupe(queryClient: QueryClient): void {
  if (installed) return;
  installed = true;
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const { queryKey } = event.query;
    if (queryKey[0] !== "base-rows") return;
    const deduped = dedupeRowPages(
      event.query.state.data as InfiniteData<RowsPage> | undefined,
    );
    if (!deduped) return;
    // after the current notification, so the cache is not written while it
    // is still telling observers about the previous write
    queueMicrotask(() => {
      const again = dedupeRowPages(
        queryClient.getQueryData<InfiniteData<RowsPage>>(queryKey),
      );
      if (again) queryClient.setQueryData(queryKey, again);
    });
  });
}
