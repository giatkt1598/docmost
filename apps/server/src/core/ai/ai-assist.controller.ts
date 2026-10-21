import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import { streamText } from 'ai';
import { Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import {
  AI_CHAT_THROTTLER,
  ALL_NAMED_THROTTLERS_SKIPPED,
} from '../../integrations/throttle/throttler-names';
import { AiProviderService } from './ai-provider.service';
import { buildAiAssistPrompt } from './ai-assist.prompts';
import { AiAssistGenerateDto } from './dto/ai-assist.dto';
import { streamTextResponse } from './ai-stream';

type AiSettings = { generative?: boolean; search?: boolean; chat?: boolean };

export function aiSettings(workspace: Workspace): AiSettings {
  return ((workspace.settings as { ai?: AiSettings } | null)?.ai ??
    {}) as AiSettings;
}

// "Ask AI" in the editor: rewrite, translate or extend the selected text.
@UseGuards(JwtAuthGuard)
@Controller('ai-assist')
export class AiAssistController {
  constructor(private readonly aiProvider: AiProviderService) {}

  @HttpCode(HttpStatus.OK)
  @Post('status')
  status(@AuthWorkspace() workspace: Workspace) {
    return { ...this.aiProvider.describe(), settings: aiSettings(workspace) };
  }

  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AI_CHAT_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @Post('generate')
  async generate(
    @Body() dto: AiAssistGenerateDto,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    if (!aiSettings(workspace).generative) {
      throw new ForbiddenException('Generative AI is turned off');
    }
    const model = this.aiProvider.model('completion');
    const { system, prompt } = buildAiAssistPrompt(dto);

    const abort = new AbortController();
    const result = streamText({
      model,
      system,
      prompt,
      abortSignal: abort.signal,
      maxOutputTokens: 4000,
      providerOptions: this.aiProvider.providerOptions(),
    });
    await streamTextResponse(res, result.textStream, abort);
  }
}
