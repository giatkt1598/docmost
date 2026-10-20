import { Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";
import { useSsoProvidersQuery } from "@/features/sso/queries/sso-query";

export function EnforceSso() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();
  const { data: providers = [] } = useSsoProvidersQuery();
  const hasUsableProvider = providers.some((p) => p.isEnabled && p.isSupported);
  const enforced = workspace?.enforceSso === true;

  return (
    <SettingRow
      title={t("Enforce SSO")}
      description={t(
        "Members must sign in with an SSO provider. The workspace owner can still sign in with a password.",
      )}
    >
      <Switch
        checked={enforced}
        disabled={saving || (!enforced && !hasUsableProvider)}
        onChange={(e) => save({ enforceSso: e.currentTarget.checked })}
        aria-label={t("Toggle SSO enforcement")}
      />
    </SettingRow>
  );
}
