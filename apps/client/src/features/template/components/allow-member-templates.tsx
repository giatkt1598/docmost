import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";
import useUserRole from "@/hooks/use-user-role.tsx";

export function AllowMemberTemplates() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();

  return (
    <SettingRow
      title={t("Allow members to create templates")}
      description={t(
        "Allow non-admin members to create and manage templates in their spaces.",
      )}
    >
      <Switch
        checked={workspace?.settings?.templates?.allowMemberTemplates === true}
        disabled={saving || !isAdmin}
        onChange={(e) =>
          save({ allowMemberTemplates: e.currentTarget.checked })
        }
        aria-label={t("Allow members to create templates")}
      />
    </SettingRow>
  );
}
