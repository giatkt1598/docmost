import { useEffect, useState } from "react";
import { Button, Group, NumberInput, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  useAuditRetentionQuery,
  useSaveAuditRetentionMutation,
} from "@/features/audit/queries/audit-query";

const MAX_RETENTION_DAYS = 3650;

export function AuditRetentionForm() {
  const { t } = useTranslation();
  const { data } = useAuditRetentionQuery();
  const save = useSaveAuditRetentionMutation();
  const [days, setDays] = useState<number | string>("");

  useEffect(() => {
    if (data) setDays(data.retentionDays);
  }, [data]);

  return (
    <>
      <Text fz="sm" c="dimmed" mb="md">
        {t("Logs older than this are deleted automatically.")}
      </Text>
      <Group align="flex-end" gap="sm">
        <NumberInput
          label={t("Keep logs for (days)")}
          value={days}
          onChange={(value) => setDays(value as number | string)}
          min={1}
          max={MAX_RETENTION_DAYS}
          allowDecimal={false}
          w={200}
        />
        <Button
          disabled={typeof days !== "number" || days === data?.retentionDays}
          loading={save.isPending}
          onClick={() => save.mutate(days as number)}
        >
          {t("Save")}
        </Button>
      </Group>
    </>
  );
}
