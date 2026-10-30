import api from "@/lib/api-client";
import { IPagination } from "@/lib/types";
import {
  AuditLogEntry,
  AuditLogQuery,
} from "@/features/audit/types/audit.types";

export async function getAuditLogs(
  query: AuditLogQuery,
): Promise<IPagination<AuditLogEntry>> {
  const req = await api.post("/audit", query);
  return req.data;
}

export async function getAuditRetention(): Promise<{ retentionDays: number }> {
  const req = await api.post("/audit/retention");
  return req.data;
}

export async function saveAuditRetention(
  auditRetentionDays: number,
): Promise<{ retentionDays: number }> {
  const req = await api.post("/audit/retention/update", { auditRetentionDays });
  return req.data;
}
