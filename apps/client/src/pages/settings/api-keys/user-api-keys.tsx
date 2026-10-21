import { Alert } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { ApiKeysPanel } from "@/features/api-key/components/api-keys-panel";

export default function UserApiKeys() {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const { isAdmin } = useUserRole();
  const restricted = workspace?.settings?.api?.restrictToAdmins === true;
  const allowed = !restricted || isAdmin;

  return (
    <>
      <DocumentTitle title={t("API keys")} />
      <SettingsTitle title={t("API keys")} />

      {!allowed && (
        <Alert
          variant="light"
          color="yellow"
          mb="md"
          icon={<IconInfoCircle size={18} />}
        >
          {t(
            "API access is restricted to admins by your workspace administrator. Your keys do not work while this is on.",
          )}
        </Alert>
      )}

      <ApiKeysPanel
        canCreate={allowed}
        description={t(
          "API keys act as you: they have your permissions. Send one as a Bearer token in the Authorization header.",
        )}
      />
    </>
  );
}
