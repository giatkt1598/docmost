import { Module } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { AiAssistController } from './ai-assist.controller';

@Module({
  controllers: [AiAssistController],
  providers: [AiProviderService],
  exports: [AiProviderService],
})
export class AiModule {}
