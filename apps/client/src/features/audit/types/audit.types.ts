export type AuditLogEntry = {
  id: string;
  actorId: string | null;
  actorType: "user" | "system" | "api_key";
  event: string;
  resourceType: string;
  resourceId: string | null;
  spaceId: string | null;
  changes: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  } | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
  resource: { id: string; name: string | null } | null;
};

export type AuditLogQuery = {
  cursor?: string;
  limit?: number;
  event?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
};
