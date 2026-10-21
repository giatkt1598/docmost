export interface IApiKeyCreator {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface IApiKey {
  id: string;
  name: string;
  creatorId: string;
  workspaceId: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  creator?: IApiKeyCreator | null;
}

// returned once, right after creation
export interface ICreatedApiKey extends IApiKey {
  token: string;
}
