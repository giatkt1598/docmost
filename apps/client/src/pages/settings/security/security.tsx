import { Divider, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { DisablePublicSharing } from "@/features/security/components/disable-public-sharing";
import { EnforceMfa } from "@/features/security/components/enforce-mfa";
import { TrashRetention } from "@/features/security/components/trash-retention";
import { AllowedDomains } from "@/features/security/components/allowed-domains";
import { SsoProviderList } from "@/features/sso/components/sso-provider-list";
import { EnforceSso } from "@/features/sso/components/enforce-sso";

export default function SecuritySettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  if (!isAdmin) return null;

  return (
    <>
      <DocumentTitle title={t("Security")} />
      <SettingsTitle title={t("Security")} />

      <EnforceMfa />
      <Divider my="lg" />
      <DisablePublicSharing />
      <Divider my="lg" />
      <TrashRetention />

      <Title order={4} mt="xl" mb="md">
        {t("Sign-up restrictions")}
      </Title>
      <AllowedDomains />

      <Title order={4} mt="xl" mb="md">
        {t("Single sign-on")}
      </Title>
      <SsoProviderList />
      <Divider my="lg" />
      <EnforceSso />
    </>
  );
}
