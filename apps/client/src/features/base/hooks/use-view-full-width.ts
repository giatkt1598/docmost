import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useBaseInfoQuery } from "@/features/base/queries/base-query";
import { VIEW_PARAM } from "@/features/base/hooks/use-active-view";
import { sortByPosition } from "@/features/base/utils/position";
import { pickActiveView, viewFullWidth } from "@/features/base/utils/full-width";

// Whether the active view of a base wants the full width, for the component
// that owns the width of the box around a BaseWorkspace.
//
//  - Standalone page: the active view is in `?view=` and the views are in the
//    base info cache, so the value is derived from those on the very first
//    render, in step with the workspace (no flash of the narrow width, and a
//    tab switch changes it in the same render).
//  - Embed: the active view lives in the workspace's local state. The
//    workspace reports it through `onFullWidthChange`; until then the first
//    view's setting is used, which is what the workspace starts with.
export function useViewFullWidth(pageId: string | undefined, embedded: boolean) {
  const { data: base } = useBaseInfoQuery(pageId);
  const [params] = useSearchParams();
  const [reported, setReported] = useState<{ pageId?: string; value: boolean } | null>(null);

  const views = sortByPosition(base?.views ?? []);
  const derived = viewFullWidth(pickActiveView(views, embedded ? null : params.get(VIEW_PARAM)));

  const onFullWidthChange = useCallback(
    (value: boolean) => setReported({ pageId, value }),
    [pageId],
  );

  const fullWidth = embedded && reported && reported.pageId === pageId ? reported.value : derived;
  return { fullWidth, onFullWidthChange };
}
