import { useState } from "react";
import { Badge, Group, Select, Table, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate";
import NoTableResults from "@/components/common/no-table-results";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate";
import { timeAgo } from "@/lib/time";
import {
  AUDIT_EVENT_GROUPS,
  auditEventLabel,
} from "@/features/audit/lib/audit-events";
import { useAuditLogsQuery } from "@/features/audit/queries/audit-query";
import { AuditLogEntry } from "@/features/audit/types/audit.types";
import { AuditLogDetail } from "@/features/audit/components/audit-log-detail";

// A date input gives a calendar day: the end of the range includes all of it.
function dayBoundary(day: string, end: boolean) {
  if (!day) return undefined;
  return new Date(`${day}T${end ? "23:59:59.999" : "00:00:00"}`).toISOString();
}

export function AuditLogList() {
  const { t } = useTranslation();
  const { cursor, goNext, goPrev, resetCursor } = useCursorPaginate();
  const [event, setEvent] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const { data } = useAuditLogsQuery({
    cursor,
    limit: 50,
    event: event ?? undefined,
    startDate: dayBoundary(from, false),
    endDate: dayBoundary(to, true),
  });

  const filterChanged =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      apply(value);
      resetCursor();
    };

  return (
    <>
      <Group mb="md" gap="sm" align="flex-end">
        <Select
          label={t("Event")}
          placeholder={t("All events")}
          data={AUDIT_EVENT_GROUPS.map(({ group, events }) => ({
            group: t(group),
            items: Object.entries(events).map(([value, label]) => ({
              value,
              label: t(label),
            })),
          }))}
          value={event}
          onChange={(value) => filterChanged(setEvent)(value as string | null)}
          clearable
          searchable
          w={260}
        />
        <TextInput
          type="date"
          label={t("From")}
          value={from}
          onChange={(e) => filterChanged(setFrom)(e.currentTarget.value)}
        />
        <TextInput
          type="date"
          label={t("To")}
          value={to}
          onChange={(e) => filterChanged(setTo)(e.currentTarget.value)}
        />
      </Group>

      <Table.ScrollContainer minWidth={700}>
        <Table highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Time")}</Table.Th>
              <Table.Th>{t("Actor")}</Table.Th>
              <Table.Th>{t("Event")}</Table.Th>
              <Table.Th>{t("Target")}</Table.Th>
              <Table.Th>{t("IP address")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.items.length ? (
              data.items.map((entry) => (
                <Table.Tr
                  key={entry.id}
                  onClick={() => setSelected(entry)}
                  style={{ cursor: "pointer" }}
                >
                  <Table.Td>
                    <Text fz="sm" title={entry.createdAt}>
                      {timeAgo(new Date(entry.occurredAt ?? entry.createdAt))}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Text fz="sm">
                        {entry.actor?.name ??
                          (entry.metadata?.email as string) ??
                          t("System")}
                      </Text>
                      {entry.actorType === "api_key" && (
                        <Badge size="xs" variant="light">
                          {t("Automation")}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm">{t(auditEventLabel(entry.event))}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm" lineClamp={1}>
                      {entry.resource?.name ??
                        (entry.metadata?.title as string) ??
                        (entry.metadata?.name as string) ??
                        ""}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm">{entry.ipAddress ?? ""}</Text>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={5} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {!!data?.items.length && (
        <Paginate
          hasPrevPage={data.meta.hasPrevPage}
          hasNextPage={data.meta.hasNextPage}
          onNext={() => goNext(data.meta.nextCursor)}
          onPrev={goPrev}
        />
      )}

      <AuditLogDetail entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
