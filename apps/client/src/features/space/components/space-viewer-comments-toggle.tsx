import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types.ts";
import { useUpdateSpaceMutation } from "@/features/space/queries/space-query.ts";
import { SettingRow } from "@/features/security/components/setting-row";

interface SpaceViewerCommentsToggleProps {
  space: ISpace;
}

export function SpaceViewerCommentsToggle({
  space,
}: SpaceViewerCommentsToggleProps) {
  const { t } = useTranslation();
  const updateSpaceMutation = useUpdateSpaceMutation();

  return (
    <SettingRow
      title={t("Allow viewers to comment")}
      description={t("Allow viewers to add comments on pages in this space.")}
    >
      <Switch
        size="xs"
        checked={space.settings?.comments?.allowViewerComments === true}
        disabled={updateSpaceMutation.isPending}
        onChange={(e) =>
          updateSpaceMutation.mutate({
            spaceId: space.id,
            allowViewerComments: e.currentTarget.checked,
          })
        }
        aria-label={t("Toggle viewer comments")}
      />
    </SettingRow>
  );
}
