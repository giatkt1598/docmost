import { useCallback, useState } from "react";
import { BaseProperty, BaseView } from "@/features/base/types/base.types";
import { useUpdateViewMutation } from "@/features/base/queries/base-view-query";
import {
  useDeletePropertyMutation,
  useUpdatePropertyMutation,
} from "@/features/base/queries/base-property-query";
import { reorderColumns, toggleHidden, withWidth } from "@/features/base/utils/grid-columns";

// Header actions of the table: rename / hide / delete, drag to reorder and
// resize. Widths follow the pointer locally and are saved on release.
export function useColumnActions(pageId: string, view: BaseView, properties: BaseProperty[]) {
  const updateView = useUpdateViewMutation(pageId);
  const updateProperty = useUpdatePropertyMutation(pageId);
  const deleteProperty = useDeletePropertyMutation(pageId);
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>({});

  const rename = useCallback(
    (propertyId: string, name: string) => updateProperty.mutate({ propertyId, name }),
    [updateProperty],
  );

  const hide = useCallback(
    (propertyId: string) =>
      updateView.mutate({
        viewId: view.id,
        config: { hiddenPropertyIds: toggleHidden(view.config.hiddenPropertyIds, propertyId, true) },
      }),
    [updateView, view.id, view.config.hiddenPropertyIds],
  );

  const remove = useCallback(
    (propertyId: string) => deleteProperty.mutate(propertyId),
    [deleteProperty],
  );

  const move = useCallback(
    (movedId: string, targetId: string, edge: "left" | "right") =>
      updateView.mutate({
        viewId: view.id,
        config: {
          propertyOrder: reorderColumns(properties, view.config.propertyOrder, movedId, targetId, edge),
        },
      }),
    [updateView, view.id, view.config.propertyOrder, properties],
  );

  const resize = useCallback(
    (propertyId: string, width: number, done: boolean) => {
      setWidthOverrides((w) => ({ ...w, [propertyId]: width }));
      if (!done) return;
      updateView.mutate(
        {
          viewId: view.id,
          config: { propertyWidths: withWidth(view.config.propertyWidths, propertyId, width) },
        },
        {
          onSettled: () =>
            setWidthOverrides(({ [propertyId]: _drop, ...rest }) => rest),
        },
      );
    },
    [updateView, view.id, view.config.propertyWidths],
  );

  return { widthOverrides, rename, hide, remove, move, resize };
}
