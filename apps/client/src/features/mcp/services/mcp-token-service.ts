import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import {
  ICreatedMcpToken,
  ICreateMcpToken,
  IMcpToken,
  IMcpTokenWithOwner,
} from "@/features/mcp/types/mcp-token.types";

export async function getMcpServerInfo(): Promise<{ enabled: boolean }> {
  const req = await api.post<{ enabled: boolean }>("/mcp-tokens/info");
  return req.data;
}

export async function getMcpTokens(): Promise<IMcpToken[]> {
  const req = await api.post<IMcpToken[]>("/mcp-tokens");
  return req.data;
}

export async function getAllMcpTokens(params: {
  cursor?: string;
}): Promise<IPagination<IMcpTokenWithOwner>> {
  const req = await api.post("/mcp-tokens/all", params);
  return req.data;
}

export async function createMcpToken(
  data: ICreateMcpToken,
): Promise<ICreatedMcpToken> {
  const req = await api.post<ICreatedMcpToken>("/mcp-tokens/create", data);
  return req.data;
}

export async function revokeMcpToken(tokenId: string): Promise<void> {
  await api.post("/mcp-tokens/revoke", { tokenId });
}
