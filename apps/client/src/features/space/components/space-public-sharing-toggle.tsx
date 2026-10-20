import { Switch, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { ISpace } from "@/features/space/types/space.types.ts";
import { useUpdateSpaceMutation } from "@/features/space/queries/space-query.ts";
import { SettingRow } from "@/features/security/components/setting-row";

interface SpacePublicSharingToggleProps {
  space: ISpace;
}

export function SpacePublicSharingToggle({
  space,
}: SpacePublicSharingToggleProps) {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const updateSpaceMutation = useUpdateSpaceMutation();
  const workspaceDisabled = workspace?.settings?.sharing?.disabled === true;
  const checked = space.settings?.sharing?.disabled === true;

  const save = (value: boolean) =>
    updateSpaceMutation.mutate({
      spaceId: space.id,
      disablePublicSharing: value,
    });

  const onChange = (value: boolean) =>
    modals.openConfirmModal({
      title: value ? t("Disable public sharing") : t("Enable public sharing"),
      children: (
        <Text size="sm">
          {value
            ? t(
                "Are you sure you want to disable public sharing? All existing shared links in this space will be deleted.",
              )
            : t(
                "Are you sure you want to enable public sharing for this space?",
              )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Confirm"), cancel: t("Cancel") },
      confirmProps: value ? { color: "red" } : {},
      onConfirm: () => save(value),
    });

  return (
    <SettingRow
      title={t("Disable public sharing")}
      description={
        workspaceDisabled
          ? t("Public sharing is disabled at the workspace level")
          : t("Prevent pages in this space from being shared publicly.")
      }
    >
      <Switch
        size="xs"
        checked={workspaceDisabled || checked}
        disabled={workspaceDisabled || updateSpaceMutation.isPending}
        onChange={(e) => onChange(e.currentTarget.checked)}
        aria-label={t("Toggle space public sharing")}
      />
    </SettingRow>
  );
}
