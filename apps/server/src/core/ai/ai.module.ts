import { Module } from '@nestjs/common';
import { AiProviderModule } from './ai-provider.module';
import { AiAssistController } from './ai-assist.controller';
import { AiProviderController } from './ai-provider.controller';
import { AiProviderAdminService } from './ai-provider-admin.service';
import { AiAnswerController } from './ai-answer.controller';
import { AiSearchService } from './ai-search.service';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { McpModule } from '../mcp/mcp.module';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [AiProviderModule, EmbeddingModule, McpModule],
  controllers: [
    AiAssistController,
    AiProviderController,
    AiAnswerController,
    AiChatController,
  ],
  providers: [AiProviderAdminService, AiSearchService, AiChatService],
  exports: [AiProviderModule],
})
export class AiModule {}
