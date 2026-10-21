import api from "@/lib/api-client";

export type AiDriver = "ollama" | "openai" | "openai-compatible" | "gemini";

export interface IAiProviderInfo {
  configured: boolean;
  source: "workspace" | "environment" | null;
  driver: AiDriver | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  completionModel: string | null;
  chatModel: string | null;
}

export interface IAiConnection {
  driver: AiDriver;
  baseUrl?: string;
  apiKey?: string;
}

export interface IAiModel {
  id: string;
  supportsTools?: boolean;
  size?: number;
}

export interface IAiTestResult {
  ok: boolean;
  latencyMs: number;
  sample?: string;
  error?: string;
}

export async function getAiProvider(): Promise<IAiProviderInfo> {
  const req = await api.post<IAiProviderInfo>("/ai-provider/info");
  return req.data;
}

export async function saveAiProvider(
  data: IAiConnection & {
    completionModel: string;
    chatModel?: string;
    clearApiKey?: boolean;
  },
): Promise<IAiProviderInfo> {
  const req = await api.post<IAiProviderInfo>("/ai-provider/save", data);
  return req.data;
}

export async function deleteAiProvider(): Promise<IAiProviderInfo> {
  const req = await api.post<IAiProviderInfo>("/ai-provider/delete");
  return req.data;
}

export async function listAiModels(data: IAiConnection): Promise<IAiModel[]> {
  const req = await api.post<IAiModel[]>("/ai-provider/models", data);
  return req.data;
}

export async function testAiProvider(
  data: IAiConnection & { model: string },
): Promise<IAiTestResult> {
  const req = await api.post<IAiTestResult>("/ai-provider/test", data);
  return req.data;
}
