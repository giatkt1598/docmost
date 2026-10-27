import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";

export function RestrictMcpToAdmins() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();

  return (
    <SettingRow
      title={t("Restrict MCP to admins")}
      description={t(
        "Only workspace admins can create and use MCP tokens. Tokens of other members stop working until this is turned off.",
      )}
    >
      <Switch
        checked={workspace?.settings?.mcp?.restrictToAdmins === true}
        disabled={saving}
        onChange={(e) => save({ restrictMcpToAdmins: e.currentTarget.checked })}
        aria-label={t("Toggle MCP restriction")}
      />
    </SettingRow>
  );
}
