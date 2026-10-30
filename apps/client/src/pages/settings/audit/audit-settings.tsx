import { Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { AuditLogList } from "@/features/audit/components/audit-log-list";
import { AuditRetentionForm } from "@/features/audit/components/audit-retention-form";
import { SiemDestinationList } from "@/features/siem/components/siem-destination-list";

const BASE_PATH = "/settings/audit";

export default function AuditSettings() {
  const { t } = useTranslation();
  const { isOwner } = useUserRole();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isOwner) return null;

  const tab = location.pathname.split("/")[3] ?? "logs";

  return (
    <>
      <DocumentTitle title={t("Audit logs & SIEM")} />
      <SettingsTitle title={t("Audit logs & SIEM")} />

      <Tabs
        value={tab}
        onChange={(value) =>
          navigate(value === "logs" ? BASE_PATH : `${BASE_PATH}/${value}`)
        }
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="logs">{t("Audit logs")}</Tabs.Tab>
          <Tabs.Tab value="siem">{t("SIEM")}</Tabs.Tab>
          <Tabs.Tab value="retention">{t("Retention")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="logs">
          {tab === "logs" && <AuditLogList />}
        </Tabs.Panel>
        <Tabs.Panel value="siem">
          {tab === "siem" && <SiemDestinationList />}
        </Tabs.Panel>
        <Tabs.Panel value="retention">
          <AuditRetentionForm />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
