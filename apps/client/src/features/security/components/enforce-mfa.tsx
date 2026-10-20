import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";

export function EnforceMfa() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();

  return (
    <SettingRow
      title={t("Enforce two-factor authentication")}
      description={t(
        "Once enforced, all members must enable two-factor authentication to access the workspace.",
      )}
    >
      <Switch
        checked={workspace?.enforceMfa === true}
        disabled={saving}
        onChange={(e) => save({ enforceMfa: e.currentTarget.checked })}
        aria-label={t("Toggle MFA enforcement")}
      />
    </SettingRow>
  );
}
