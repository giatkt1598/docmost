import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { LanguageModel } from 'ai';
import { createOllama } from 'ai-sdk-ollama';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { EnvironmentService } from '../../integrations/environment/environment.service';

export type AiModelKind = 'completion' | 'chat';

// Language models built from the AI_* environment variables.
@Injectable()
export class AiProviderService {
  constructor(private readonly environmentService: EnvironmentService) {}

  isConfigured(): boolean {
    return (
      !!this.environmentService.getAiDriver() &&
      !!this.environmentService.getAiCompletionModel()
    );
  }

  describe() {
    return {
      configured: this.isConfigured(),
      driver: this.environmentService.getAiDriver() ?? null,
      completionModel: this.environmentService.getAiCompletionModel() ?? null,
      chatModel: this.environmentService.getAiChatModel() ?? null,
    };
  }

  model(kind: AiModelKind = 'completion'): LanguageModel {
    const env = this.environmentService;
    const driver = env.getAiDriver();
    const modelId =
      kind === 'chat' ? env.getAiChatModel() : env.getAiCompletionModel();
    if (!driver || !modelId) {
      throw new ServiceUnavailableException('AI is not configured');
    }

    switch (driver) {
      case 'ollama':
        return createOllama({
          baseURL: env.getOllamaApiUrl(),
          // for an Ollama behind an authenticating reverse proxy
          ...(env.getOllamaApiKey() && { apiKey: env.getOllamaApiKey() }),
        })(modelId);
      case 'openai':
        return createOpenAI({
          apiKey: env.getOpenAiApiKey(),
          ...(env.getOpenAiApiUrl() && { baseURL: env.getOpenAiApiUrl() }),
        })(modelId);
      case 'openai-compatible':
        return createOpenAICompatible({
          name: 'openai-compatible',
          baseURL: env.getOpenAiApiUrl(),
          apiKey: env.getOpenAiApiKey(),
        })(modelId);
      case 'gemini':
        return createGoogleGenerativeAI({ apiKey: env.getGeminiApiKey() })(
          modelId,
        );
      default:
        throw new ServiceUnavailableException(
          `Unsupported AI driver: ${driver}`,
        );
    }
  }

  // Provider-specific options: answers come faster without a reasoning pass.
  providerOptions() {
    return { ollama: { think: false } };
  }
}
