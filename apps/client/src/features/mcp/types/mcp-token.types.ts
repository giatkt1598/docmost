export interface IMcpToken {
  id: string;
  name: string;
  userId: string;
  workspaceId: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ICreateMcpToken {
  name: string;
  expiresAt?: string;
}

export interface ICreatedMcpToken {
  token: string;
  mcpToken: IMcpToken;
}
