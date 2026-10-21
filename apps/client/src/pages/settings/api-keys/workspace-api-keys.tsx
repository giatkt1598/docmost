import { Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { ApiKeysPanel } from "@/features/api-key/components/api-keys-panel";
import { RestrictApiToAdmins } from "@/features/api-key/components/restrict-api-to-admins";

export default function WorkspaceApiKeys() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  if (!isAdmin) return null;

  return (
    <>
      <DocumentTitle title={t("API management")} />
      <SettingsTitle title={t("API management")} />

      <RestrictApiToAdmins />
      <Divider my="lg" />

      <ApiKeysPanel
        adminView
        canCreate
        description={t("API keys of every member of the workspace.")}
      />
    </>
  );
}
