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
  embeddingModel: string | null;
  embeddingDimensions: number | null;
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
    embeddingModel?: string;
    embeddingDimensions?: number;
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

export interface IAiEmbeddingTestResult {
  ok: boolean;
  latencyMs: number;
  dimensions?: number;
  error?: string;
}

export async function testAiEmbedding(
  data: IAiConnection & { model: string; dimensions?: number },
): Promise<IAiEmbeddingTestResult> {
  const req = await api.post<IAiEmbeddingTestResult>(
    "/ai-provider/test-embedding",
    data,
  );
  return req.data;
}

export interface ISearchIndexStatus {
  pgvector: boolean;
  configured: boolean;
  model: string | null;
  pagesTotal?: number;
  pagesIndexed?: number;
  attachmentsTotal?: number;
  attachmentsIndexed?: number;
  dimensions?: number | null;
  busy: boolean;
}

export async function getSearchIndexStatus(): Promise<ISearchIndexStatus> {
  const req = await api.post<ISearchIndexStatus>("/ai-provider/search-index");
  return req.data;
}

export async function rebuildSearchIndex(): Promise<ISearchIndexStatus> {
  const req = await api.post<ISearchIndexStatus>(
    "/ai-provider/search-index/rebuild",
  );
  return req.data;
}
