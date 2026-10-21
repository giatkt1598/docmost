import { Module } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { AiAssistController } from './ai-assist.controller';
import { AiProviderController } from './ai-provider.controller';
import { AiProviderAdminService } from './ai-provider-admin.service';

@Module({
  controllers: [AiAssistController, AiProviderController],
  providers: [AiProviderService, AiProviderAdminService],
  exports: [AiProviderService],
})
export class AiModule {}
