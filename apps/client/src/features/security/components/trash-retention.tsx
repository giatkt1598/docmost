import { Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/features/security/components/setting-row";
import { useUpdateWorkspaceSetting } from "@/features/security/hooks/use-update-workspace-setting";

const DEFAULT_RETENTION_DAYS = 30;
const OPTIONS = [7, 14, 30, 60, 90, 180, 365];

export function TrashRetention() {
  const { t } = useTranslation();
  const { workspace, save, saving } = useUpdateWorkspaceSetting();
  const current = workspace?.trashRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const options = OPTIONS.includes(current)
    ? OPTIONS
    : [...OPTIONS, current].sort((a, b) => a - b);

  return (
    <SettingRow
      title={t("Trash retention")}
      description={t(
        "Pages in trash will be permanently deleted after this period.",
      )}
    >
      <Select
        w={160}
        value={String(current)}
        disabled={saving}
        allowDeselect={false}
        aria-label={t("Trash retention")}
        data={options.map((days) => ({
          value: String(days),
          label: `${days} ${t("days")}`,
        }))}
        onChange={(value) => {
          if (value && Number(value) !== current) {
            save({ trashRetentionDays: Number(value) });
          }
        }}
      />
    </SettingRow>
  );
}
