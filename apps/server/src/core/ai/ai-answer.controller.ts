import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import { streamText } from 'ai';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import {
  AI_CHAT_THROTTLER,
  ALL_NAMED_THROTTLERS_SKIPPED,
} from '../../integrations/throttle/throttler-names';
import { AiProviderService } from './ai-provider.service';
import { AiSearchService } from './ai-search.service';
import { aiSettings } from './ai-assist.controller';
import { streamNdjsonResponse } from './ai-stream';

export class AiAnswerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  query: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

const SYSTEM = [
  'You answer questions about a team wiki using only the numbered excerpts provided.',
  'Cite the excerpts you use with their number in brackets, like [1] or [2][3].',
  'If the excerpts do not contain the answer, say so briefly instead of guessing.',
  'Answer in the language of the question, concisely, formatted as Markdown.',
].join(' ');

// AI answers in search: retrieve readable pages, then stream an answer
// with numbered citations. Events: sources, text deltas, done.
@UseGuards(JwtAuthGuard)
@Controller('ai-search')
export class AiAnswerController {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly aiSearch: AiSearchService,
  ) {}

  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AI_CHAT_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @Post('answer')
  async answer(
    @Body() dto: AiAnswerDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    if (!aiSettings(workspace).search) {
      throw new ForbiddenException('AI search is turned off');
    }
    const model = await this.aiProvider.model(workspace.id, 'completion');
    const { sources, context } = await this.aiSearch.retrieve({
      question: dto.query,
      userId: user.id,
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
    });

    const abort = new AbortController();
    const aiProvider = this.aiProvider;
    async function* events() {
      yield { type: 'sources', sources };
      if (sources.length === 0) {
        yield { type: 'done', found: false };
        return;
      }
      const result = streamText({
        model,
        system: SYSTEM,
        prompt: `Excerpts:\n\n${context}\n\nQuestion: ${dto.query}`,
        abortSignal: abort.signal,
        maxOutputTokens: 1500,
        providerOptions: aiProvider.providerOptions(),
      });
      for await (const text of result.textStream) {
        yield { type: 'text', text };
      }
      yield { type: 'done', found: true };
    }
    await streamNdjsonResponse(res, events(), abort);
  }
}
