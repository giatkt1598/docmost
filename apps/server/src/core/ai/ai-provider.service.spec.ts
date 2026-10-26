import { AiProviderService } from './ai-provider.service';
import { validateConnection } from './ai-provider-admin.service';

const encryption = {
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace(/^enc:/, ''),
} as any;

function env(values: Record<string, string> = {}) {
  return {
    getAiDriver: () => values.AI_DRIVER,
    getAiCompletionModel: () => values.AI_COMPLETION_MODEL,
    getAiChatModel: () => values.AI_CHAT_MODEL ?? values.AI_COMPLETION_MODEL,
    getAiEmbeddingModel: () => values.AI_EMBEDDING_MODEL,
    getAiEmbeddingDimension: () => Number(values.AI_EMBEDDING_DIMENSION) || NaN,
    getOllamaApiUrl: () => values.OLLAMA_API_URL ?? 'http://localhost:11434',
    getOllamaApiKey: () => values.OLLAMA_API_KEY,
    getOpenAiApiUrl: () => values.OPENAI_API_URL,
    getOpenAiApiKey: () => values.OPENAI_API_KEY,
    getGeminiApiKey: () => values.GEMINI_API_KEY,
  } as any;
}

const row = {
  workspaceId: 'ws',
  driver: 'ollama',
  baseUrl: 'https://ollama.example.com',
  apiKey: 'enc:secret',
  completionModel: 'gemma4:e4b',
  chatModel: null,
  updatedAt: new Date('2026-10-21T10:00:00Z'),
};

describe('AiProviderService', () => {
  it('prefers the workspace configuration and decrypts its key', async () => {
    const repo = { find: jest.fn().mockResolvedValue(row) };
    const service = new AiProviderService(
      repo as any,
      env({ AI_DRIVER: 'openai', AI_COMPLETION_MODEL: 'gpt' }),
      encryption,
    );

    const config = await service.resolve('ws');
    expect(config).toMatchObject({
      source: 'workspace',
      driver: 'ollama',
      apiKey: 'secret',
      completionModel: 'gemma4:e4b',
    });
  });

  it('falls back to the environment', async () => {
    const service = new AiProviderService(
      { find: jest.fn().mockResolvedValue(undefined) } as any,
      env({ AI_DRIVER: 'ollama', AI_COMPLETION_MODEL: 'llama3' }),
      encryption,
    );
    expect(await service.resolve('ws')).toMatchObject({
      source: 'environment',
      driver: 'ollama',
      baseUrl: 'http://localhost:11434',
      completionModel: 'llama3',
    });
  });

  it('is unconfigured without either', async () => {
    const service = new AiProviderService(
      { find: jest.fn().mockResolvedValue(undefined) } as any,
      env(),
      encryption,
    );
    expect(await service.describe('ws')).toMatchObject({
      configured: false,
      source: null,
    });
    await expect(service.model('ws')).rejects.toThrow('No AI provider');
  });

  it('never exposes the key', async () => {
    const service = new AiProviderService(
      { find: jest.fn().mockResolvedValue(row) } as any,
      env(),
      encryption,
    );
    const described = await service.describe('ws');
    expect(described.hasApiKey).toBe(true);
    expect(JSON.stringify(described)).not.toContain('secret');
  });

  it('reloads after the configuration changes', async () => {
    const repo = { find: jest.fn().mockResolvedValue(row) };
    const service = new AiProviderService(repo as any, env(), encryption);
    await service.resolve('ws');

    repo.find.mockResolvedValue({
      ...row,
      completionModel: 'qwen3.5:9b',
      updatedAt: new Date('2026-10-21T11:00:00Z'),
    });
    expect((await service.resolve('ws')).completionModel).toBe('qwen3.5:9b');
  });

  it('builds a model for each driver', async () => {
    for (const driver of ['ollama', 'openai', 'openai-compatible', 'gemini']) {
      const service = new AiProviderService(
        {
          find: jest.fn().mockResolvedValue({
            ...row,
            driver,
            updatedAt: new Date(),
          }),
        } as any,
        env(),
        encryption,
      );
      const model: any = await service.model('ws');
      expect(model.modelId).toBe('gemma4:e4b');
    }
  });
});

describe('validateConnection', () => {
  it('requires a URL for Ollama and OpenAI-compatible', () => {
    expect(() => validateConnection('ollama', {})).toThrow('URL');
    expect(() => validateConnection('openai-compatible', {})).toThrow('URL');
    expect(() =>
      validateConnection('ollama', { baseUrl: 'http://x' }),
    ).not.toThrow();
  });

  it('requires a key for OpenAI and Gemini', () => {
    expect(() => validateConnection('openai', {})).toThrow('API key');
    expect(() => validateConnection('gemini', { apiKey: 'k' })).not.toThrow();
  });
});

describe('embeddings through an OpenAI-compatible gateway', () => {
  it('does not send encoding_format', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require('node:http');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { embed } = require('ai');
    const { buildEmbeddingModel } = require('./ai-provider.service');
    let received: any = null;
    const server = http.createServer((req: any, res: any) => {
      let body = '';
      req.on('data', (c: any) => (body += c));
      req.on('end', () => {
        received = JSON.parse(body);
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            data: [{ index: 0, embedding: [0.1, 0.2] }],
            usage: { prompt_tokens: 1, total_tokens: 1 },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    try {
      const { embedding } = await embed({
        model: buildEmbeddingModel(
          {
            driver: 'openai-compatible',
            baseUrl: `http://localhost:${port}/v1`,
            apiKey: 'k',
          },
          'bge-m3',
        ),
        value: 'xin chào',
      });
      expect(embedding).toEqual([0.1, 0.2]);
      expect(received.model).toBe('bge-m3');
      expect(received).not.toHaveProperty('encoding_format');
    } finally {
      server.close();
    }
  });
});
