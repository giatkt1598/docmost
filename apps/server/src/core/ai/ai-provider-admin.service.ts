import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { AiProviderConfigRepo } from '@docmost/db/repos/ai/ai-provider-config.repo';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import {
  AiDriver,
  AiProviderService,
  buildModel,
  DEFAULT_OLLAMA_URL,
} from './ai-provider.service';
import {
  AiProviderConnectionDto,
  SaveAiProviderDto,
  TestAiProviderDto,
} from './dto/ai-provider.dto';

const REQUEST_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MS = 60_000;

export type AiModelInfo = {
  id: string;
  supportsTools?: boolean;
  size?: number;
};

export function validateConnection(
  driver: AiDriver,
  values: { baseUrl?: string | null; apiKey?: string | null },
) {
  if (
    (driver === 'ollama' || driver === 'openai-compatible') &&
    !values.baseUrl
  ) {
    throw new BadRequestException('The server URL is required');
  }
  if ((driver === 'openai' || driver === 'gemini') && !values.apiKey) {
    throw new BadRequestException('The API key is required');
  }
}

function errorMessage(err: unknown) {
  const e = err as { name?: string; message?: string; cause?: any };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return 'The provider did not respond in time';
  }
  return (e?.cause?.message || e?.message || String(err)).slice(0, 300);
}

// Admin operations on a workspace's AI provider: save it, list the models
// a provider offers and check that a configuration works before saving.
@Injectable()
export class AiProviderAdminService {
  private readonly logger = new Logger(AiProviderAdminService.name);

  constructor(
    private readonly configRepo: AiProviderConfigRepo,
    private readonly aiProvider: AiProviderService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async save(workspaceId: string, userId: string, dto: SaveAiProviderDto) {
    const existing = await this.configRepo.find(workspaceId);
    // keep the stored key unless a new one is given or it is cleared
    const keepKey =
      !dto.clearApiKey && !dto.apiKey && existing?.driver === dto.driver;
    const apiKey = dto.apiKey
      ? this.encryptionService.encrypt(
          dto.apiKey,
          EncryptionPurpose.AI_CREDENTIALS,
        )
      : keepKey
        ? existing?.apiKey
        : null;

    validateConnection(dto.driver, {
      baseUrl: dto.baseUrl,
      apiKey: dto.apiKey || (apiKey ? 'stored' : null),
    });

    await this.configRepo.upsert({
      workspaceId,
      driver: dto.driver,
      baseUrl: dto.driver === 'gemini' ? null : dto.baseUrl || null,
      apiKey: apiKey ?? null,
      completionModel: dto.completionModel,
      chatModel: dto.chatModel || null,
      updatedById: userId,
    });
    return this.aiProvider.describe(workspaceId);
  }

  async remove(workspaceId: string) {
    await this.configRepo.delete(workspaceId);
    return this.aiProvider.describe(workspaceId);
  }

  async listModels(
    workspaceId: string,
    dto: AiProviderConnectionDto,
  ): Promise<AiModelInfo[]> {
    const { baseUrl, apiKey } = await this.connection(workspaceId, dto);
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      switch (dto.driver) {
        case 'ollama': {
          const res = await fetch(
            `${(baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '')}/api/tags`,
            {
              signal,
              headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as {
            models?: { name: string; size?: number; capabilities?: string[] }[];
          };
          return (body.models ?? []).map((m) => ({
            id: m.name,
            size: m.size,
            ...(m.capabilities && {
              supportsTools: m.capabilities.includes('tools'),
            }),
          }));
        }
        case 'gemini': {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey ?? '')}`,
            { signal },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as {
            models?: { name: string; supportedGenerationMethods?: string[] }[];
          };
          return (body.models ?? [])
            .filter((m) =>
              m.supportedGenerationMethods?.includes('generateContent'),
            )
            .map((m) => ({ id: m.name.replace(/^models\//, '') }));
        }
        default: {
          const base = (baseUrl || 'https://api.openai.com/v1').replace(
            /\/+$/,
            '',
          );
          const res = await fetch(`${base}/models`, {
            signal,
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as { data?: { id: string }[] };
          return (body.data ?? [])
            .map((m) => ({ id: m.id }))
            .sort((a, b) => a.id.localeCompare(b.id));
        }
      }
    } catch (err) {
      throw new BadRequestException(
        `Could not list models: ${errorMessage(err)}`,
      );
    }
  }

  async test(workspaceId: string, dto: TestAiProviderDto) {
    const connection = await this.connection(workspaceId, dto);
    const started = Date.now();
    try {
      const { text } = await generateText({
        model: buildModel({ driver: dto.driver, ...connection }, dto.model),
        prompt: 'Reply with the single word OK.',
        maxOutputTokens: 20,
        abortSignal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        providerOptions: this.aiProvider.providerOptions(),
      });
      return {
        ok: true,
        latencyMs: Date.now() - started,
        sample: text.trim().slice(0, 100),
      };
    } catch (err) {
      this.logger.warn(`AI provider test failed: ${errorMessage(err)}`);
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: errorMessage(err),
      };
    }
  }

  // The submitted connection, falling back to the saved key for this driver.
  private async connection(
    workspaceId: string,
    dto: AiProviderConnectionDto,
  ): Promise<{ baseUrl: string | null; apiKey: string | null }> {
    let apiKey = dto.apiKey || null;
    if (!apiKey) {
      const saved = await this.aiProvider.resolve(workspaceId);
      if (saved?.source === 'workspace' && saved.driver === dto.driver) {
        apiKey = saved.apiKey;
      }
    }
    validateConnection(dto.driver, { baseUrl: dto.baseUrl, apiKey });
    return { baseUrl: dto.baseUrl || null, apiKey };
  }
}
