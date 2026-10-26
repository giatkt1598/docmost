import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { createOllama } from 'ai-sdk-ollama';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AiProviderConfigRepo } from '@docmost/db/repos/ai/ai-provider-config.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';

export const AI_DRIVERS = [
  'ollama',
  'openai',
  'openai-compatible',
  'gemini',
] as const;
export type AiDriver = (typeof AI_DRIVERS)[number];
export type AiModelKind = 'completion' | 'chat';

export type AiConfig = {
  source: 'workspace' | 'environment';
  driver: AiDriver;
  baseUrl: string | null;
  apiKey: string | null;
  completionModel: string;
  chatModel: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
};

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

// Builds a language model for a provider configuration.
export function buildModel(
  config: Pick<AiConfig, 'driver' | 'baseUrl' | 'apiKey'>,
  modelId: string,
): LanguageModel {
  const baseURL = config.baseUrl || undefined;
  const apiKey = config.apiKey || undefined;
  switch (config.driver) {
    case 'ollama':
      // the key is sent as a Bearer token, e.g. to an authenticating proxy
      return createOllama({
        baseURL: baseURL ?? DEFAULT_OLLAMA_URL,
        ...(apiKey && { apiKey }),
      })(modelId);
    case 'openai':
      return createOpenAI({ apiKey, ...(baseURL && { baseURL }) })(modelId);
    case 'openai-compatible':
      return createOpenAICompatible({
        name: 'openai-compatible',
        baseURL,
        apiKey,
      })(modelId);
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    default:
      throw new ServiceUnavailableException(
        `Unsupported AI driver: ${config.driver}`,
      );
  }
}

// Gateways in front of other engines (LiteLLM over Ollama, ...) reject the
// encoding_format the AI SDK always sends with embedding requests; every
// server returns floats by default, so it is dropped.
export const withoutEncodingFormat: typeof fetch = async (input, init) => {
  const body = init?.body;
  if (typeof body === 'string' && body.includes('encoding_format')) {
    try {
      const json = JSON.parse(body);
      delete json.encoding_format;
      return fetch(input, { ...init, body: JSON.stringify(json) });
    } catch {
      // not JSON: send it as it is
    }
  }
  return fetch(input, init);
};

// Builds an embedding model for a provider configuration.
export function buildEmbeddingModel(
  config: Pick<AiConfig, 'driver' | 'baseUrl' | 'apiKey'>,
  modelId: string,
): EmbeddingModel {
  const baseURL = config.baseUrl || undefined;
  const apiKey = config.apiKey || undefined;
  switch (config.driver) {
    case 'ollama':
      return createOllama({
        baseURL: baseURL ?? DEFAULT_OLLAMA_URL,
        ...(apiKey && { apiKey }),
      }).embedding(modelId);
    case 'openai':
      return createOpenAI({ apiKey, ...(baseURL && { baseURL }) }).embedding(
        modelId,
      );
    case 'openai-compatible':
      return createOpenAICompatible({
        name: 'openai-compatible',
        baseURL,
        apiKey,
        fetch: withoutEncodingFormat,
      }).embeddingModel(modelId);
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey }).embedding(modelId);
    default:
      throw new ServiceUnavailableException(
        `Unsupported AI driver: ${config.driver}`,
      );
  }
}

// Provider options that shorten embeddings (Matryoshka models).
export function embeddingProviderOptions(
  driver: AiDriver,
  dimensions: number | null | undefined,
) {
  if (!dimensions) return undefined;
  switch (driver) {
    case 'openai':
    case 'openai-compatible':
      return { openai: { dimensions } };
    case 'gemini':
      return { google: { outputDimensionality: dimensions } };
    default:
      return undefined;
  }
}

// The AI provider of a workspace: configured in AI settings, with the AI_*
// environment variables as a fallback for installs configured that way.
@Injectable()
export class AiProviderService {
  private readonly cache = new Map<
    string,
    { stamp: string; config: AiConfig | null }
  >();

  constructor(
    private readonly configRepo: AiProviderConfigRepo,
    private readonly environmentService: EnvironmentService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async resolve(workspaceId: string): Promise<AiConfig | null> {
    const row = await this.configRepo.find(workspaceId);
    const stamp = row ? new Date(row.updatedAt).toISOString() : 'env';
    const cached = this.cache.get(workspaceId);
    if (cached?.stamp === stamp) return cached.config;

    let config: AiConfig | null = null;
    if (row) {
      config = {
        source: 'workspace',
        driver: row.driver as AiDriver,
        baseUrl: row.baseUrl,
        apiKey: row.apiKey
          ? this.encryptionService.decrypt(
              row.apiKey,
              EncryptionPurpose.AI_CREDENTIALS,
            )
          : null,
        completionModel: row.completionModel,
        chatModel: row.chatModel,
        embeddingModel: row.embeddingModel,
        embeddingDimensions: row.embeddingDimensions,
      };
    } else {
      config = this.fromEnvironment();
    }
    this.cache.set(workspaceId, { stamp, config });
    return config;
  }

  async isConfigured(workspaceId: string): Promise<boolean> {
    return !!(await this.resolve(workspaceId));
  }

  // Safe to send to the browser: never includes the key.
  async describe(workspaceId: string) {
    const config = await this.resolve(workspaceId);
    return {
      configured: !!config,
      source: config?.source ?? null,
      driver: config?.driver ?? null,
      baseUrl: config?.baseUrl ?? null,
      hasApiKey: !!config?.apiKey,
      completionModel: config?.completionModel ?? null,
      chatModel: config?.chatModel ?? null,
      embeddingModel: config?.embeddingModel ?? null,
      embeddingDimensions: config?.embeddingDimensions ?? null,
    };
  }

  async model(
    workspaceId: string,
    kind: AiModelKind = 'completion',
  ): Promise<LanguageModel> {
    const config = await this.resolve(workspaceId);
    if (!config) {
      throw new ServiceUnavailableException(
        'No AI provider is configured. An admin can set one up in AI settings.',
      );
    }
    const modelId =
      kind === 'chat'
        ? config.chatModel || config.completionModel
        : config.completionModel;
    return buildModel(config, modelId);
  }

  // The embedding model of a workspace, or null when none is configured.
  async embeddingModel(workspaceId: string): Promise<{
    model: EmbeddingModel;
    modelId: string;
    config: AiConfig;
  } | null> {
    const config = await this.resolve(workspaceId);
    if (!config?.embeddingModel) return null;
    return {
      model: buildEmbeddingModel(config, config.embeddingModel),
      modelId: config.embeddingModel,
      config,
    };
  }

  // Provider-specific options: answers come faster without a reasoning pass.
  providerOptions() {
    return { ollama: { think: false } };
  }

  private fromEnvironment(): AiConfig | null {
    const env = this.environmentService;
    const driver = env.getAiDriver() as AiDriver;
    const completionModel = env.getAiCompletionModel();
    if (!driver || !completionModel || !AI_DRIVERS.includes(driver)) {
      return null;
    }
    const baseUrl =
      driver === 'ollama'
        ? env.getOllamaApiUrl()
        : driver === 'gemini'
          ? null
          : env.getOpenAiApiUrl() || null;
    const apiKey =
      driver === 'ollama'
        ? env.getOllamaApiKey() || null
        : driver === 'gemini'
          ? env.getGeminiApiKey() || null
          : env.getOpenAiApiKey() || null;
    return {
      source: 'environment',
      driver,
      baseUrl,
      apiKey,
      completionModel,
      chatModel: env.getAiChatModel() || null,
      embeddingModel: env.getAiEmbeddingModel() || null,
      embeddingDimensions: env.getAiEmbeddingDimension() || null,
    };
  }
}
