import { Module } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';

// The workspace AI provider on its own, for modules that only need to build
// models (search embeddings) without pulling in the whole AI module.
@Module({
  providers: [AiProviderService],
  exports: [AiProviderService],
})
export class AiProviderModule {}
