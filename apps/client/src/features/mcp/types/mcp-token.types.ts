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

// a token with its owner, as the admin management list returns it
export interface IMcpTokenWithOwner extends IMcpToken {
  owner: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
}

export interface ICreateMcpToken {
  name: string;
  expiresAt?: string;
}

export interface ICreatedMcpToken {
  token: string;
  mcpToken: IMcpToken;
}
