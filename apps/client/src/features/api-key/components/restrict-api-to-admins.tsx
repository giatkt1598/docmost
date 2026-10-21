import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";

export function RestrictApiToAdmins() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();

  return (
    <SettingRow
      title={t("Restrict API to admins")}
      description={t(
        "Only workspace admins can create and use API keys. Keys of other members stop working until this is turned off.",
      )}
    >
      <Switch
        checked={workspace?.settings?.api?.restrictToAdmins === true}
        disabled={saving}
        onChange={(e) => save({ restrictApiToAdmins: e.currentTarget.checked })}
        aria-label={t("Toggle API restriction")}
      />
    </SettingRow>
  );
}
