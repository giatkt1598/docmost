import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import {
  IApiKey,
  ICreatedApiKey,
} from "@/features/api-key/types/api-key.types";

export async function getApiKeys(params: {
  cursor?: string;
  adminView?: boolean;
}): Promise<IPagination<IApiKey>> {
  const req = await api.post<IPagination<IApiKey>>("/user-api-keys", params);
  return req.data;
}

export async function createApiKey(data: {
  name: string;
  expiresAt?: string;
}): Promise<ICreatedApiKey> {
  const req = await api.post<ICreatedApiKey>("/user-api-keys/create", data);
  return req.data;
}

export async function renameApiKey(data: {
  apiKeyId: string;
  name: string;
}): Promise<IApiKey> {
  const req = await api.post<IApiKey>("/user-api-keys/update", data);
  return req.data;
}

export async function revokeApiKey(apiKeyId: string): Promise<void> {
  await api.post("/user-api-keys/revoke", { apiKeyId });
}
