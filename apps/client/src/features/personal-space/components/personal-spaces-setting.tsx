import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";

export function PersonalSpacesSetting() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();

  return (
    <SettingRow
      title={t("Allow personal spaces")}
      description={t("Members can create their own personal space.")}
    >
      <Switch
        checked={workspace?.settings?.spaces?.allowPersonal === true}
        disabled={saving}
        onChange={(e) => save({ allowPersonalSpaces: e.currentTarget.checked })}
        aria-label={t("Toggle allow personal spaces")}
      />
    </SettingRow>
  );
}
