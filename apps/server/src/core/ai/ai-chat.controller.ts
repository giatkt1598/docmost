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
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import {
  AI_CHAT_THROTTLER,
  ALL_NAMED_THROTTLERS_SKIPPED,
} from '../../integrations/throttle/throttler-names';
import { AiChatService, ChatSettings } from './ai-chat.service';
import { streamNdjsonResponse } from './ai-stream';

class ChatIdDto {
  @IsUUID()
  chatId: string;
}

class ListChatsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;
}

class RenameChatDto extends ChatIdDto {
  @Transform(({ value }: TransformFnParams) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;
}

class SendChatMessageDto {
  @IsOptional()
  @IsUUID()
  chatId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  message: string;

  // the page the user is looking at, so "this page" works
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pageId?: string;
}

type AiChatSettings = {
  chat?: boolean;
  chatReadOnly?: boolean;
  chatWorkspaceKnowledgeOnly?: boolean;
};

function chatSettings(workspace: Workspace): AiChatSettings {
  return (workspace.settings as { ai?: AiChatSettings } | null)?.ai ?? {};
}

// AI chat: each user's own conversations with an assistant that can search
// and read (and, unless the workspace makes it read-only, edit) pages.
@UseGuards(JwtAuthGuard)
@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly chatService: AiChatService) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  list(
    @Body() dto: ListChatsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertEnabled(workspace);
    return this.chatService.list(user, workspace, dto.query);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(
    @Body() dto: ChatIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertEnabled(workspace);
    return this.chatService.info(user, workspace, dto.chatId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rename')
  rename(
    @Body() dto: RenameChatDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertEnabled(workspace);
    return this.chatService.rename(user, workspace, dto.chatId, dto.title);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(
    @Body() dto: ChatIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertEnabled(workspace);
    await this.chatService.remove(user, workspace, dto.chatId);
  }

  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AI_CHAT_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @Post('send')
  async send(
    @Body() dto: SendChatMessageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const ai = this.assertEnabled(workspace);
    const settings: ChatSettings = {
      readOnly: ai.chatReadOnly === true,
      workspaceKnowledgeOnly: ai.chatWorkspaceKnowledgeOnly === true,
    };
    const abort = new AbortController();
    const events = this.chatService.send({
      user,
      workspace,
      chatId: dto.chatId,
      message: dto.message,
      pageId: dto.pageId,
      settings,
      abort: abort.signal,
    });
    await streamNdjsonResponse(res, events, abort);
  }

  private assertEnabled(workspace: Workspace) {
    const ai = chatSettings(workspace);
    if (!ai.chat) throw new ForbiddenException('AI chat is turned off');
    return ai;
  }
}
