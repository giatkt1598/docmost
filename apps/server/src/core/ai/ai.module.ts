import { Module } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { AiAssistController } from './ai-assist.controller';
import { AiProviderController } from './ai-provider.controller';
import { AiProviderAdminService } from './ai-provider-admin.service';
import { AiAnswerController } from './ai-answer.controller';
import { AiSearchService } from './ai-search.service';
import { AiQueueDrainProcessor } from './ai-queue-drain.processor';
import { hasEnterpriseModule } from '../auth/auth-capabilities';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [McpModule],
  controllers: [
    AiAssistController,
    AiProviderController,
    AiAnswerController,
    AiChatController,
  ],
  providers: [
    AiProviderService,
    AiProviderAdminService,
    AiSearchService,
    AiChatService,
    // the enterprise indexer consumes the AI queue when it is bundled
    ...(hasEnterpriseModule() ? [] : [AiQueueDrainProcessor]),
  ],
  exports: [AiProviderService],
})
export class AiModule {}
