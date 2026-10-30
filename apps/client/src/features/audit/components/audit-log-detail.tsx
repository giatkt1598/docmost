import { Code, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { auditEventLabel } from "@/features/audit/lib/audit-events";
import { AuditLogEntry } from "@/features/audit/types/audit.types";
import { formattedDate } from "@/lib/time";

type Props = {
  entry: AuditLogEntry | null;
  onClose: () => void;
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
      <Text fz="sm" style={{ wordBreak: "break-word" }}>
        {value}
      </Text>
    </div>
  );
}

function JsonField({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <div>
      <Text fz="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      <Code block>{JSON.stringify(value, null, 2)}</Code>
    </div>
  );
}

export function AuditLogDetail({ entry, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={!!entry}
      onClose={onClose}
      title={entry ? t(auditEventLabel(entry.event)) : ""}
      size="lg"
    >
      {entry && (
        <Stack gap="sm">
          <Field
            label={t("Time")}
            value={formattedDate(new Date(entry.occurredAt ?? entry.createdAt))}
          />
          <Field label={t("Event")} value={entry.event} />
          <Field
            label={t("Actor")}
            value={entry.actor?.email ?? entry.actorId}
          />
          <Field label={t("Actor type")} value={entry.actorType} />
          <Field
            label={t("Target")}
            value={entry.resource?.name ?? entry.resourceId}
          />
          <Field label={t("IP address")} value={entry.ipAddress} />
          <Field label={t("User agent")} value={entry.userAgent} />
          <JsonField label={t("Changes")} value={entry.changes} />
          <JsonField label={t("Details")} value={entry.metadata} />
        </Stack>
      )}
    </Modal>
  );
}
