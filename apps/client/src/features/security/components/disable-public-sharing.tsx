import { Switch } from "@mantine/core";
import { modals } from "@mantine/modals";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";

export function DisablePublicSharing() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();
  const disabled = workspace?.settings?.sharing?.disabled === true;

  const toggle = (next: boolean) => {
    // disabling deletes every existing share link, so confirm first
    if (next) {
      modals.openConfirmModal({
        title: t("Disable public sharing"),
        centered: true,
        children: (
          <Text size="sm">
            {t(
              "Are you sure you want to disable public sharing? All existing shared links in this workspace will be deleted.",
            )}
          </Text>
        ),
        labels: { confirm: t("Disable"), cancel: t("Cancel") },
        confirmProps: { color: "red" },
        onConfirm: () => save({ disablePublicSharing: true }),
      });
    } else {
      save({ disablePublicSharing: false });
    }
  };

  return (
    <SettingRow
      title={t("Disable public sharing")}
      description={t("Prevent members from sharing pages publicly.")}
    >
      <Switch
        checked={disabled}
        disabled={saving}
        onChange={(e) => toggle(e.currentTarget.checked)}
        aria-label={t("Toggle public sharing")}
      />
    </SettingRow>
  );
}
