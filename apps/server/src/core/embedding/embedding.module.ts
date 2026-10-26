import { Module } from '@nestjs/common';
import { AiProviderModule } from '../ai/ai-provider.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { AttachmentTextService } from './attachment-text.service';
import { EmbeddingIndexService } from './embedding-index.service';
import { EmbeddingProcessor } from './embedding.processor';
import { hasEnterpriseModule } from '../auth/auth-capabilities';

@Module({
  imports: [AiProviderModule, StorageModule],
  providers: [
    EmbeddingIndexService,
    AttachmentTextService,
    // the enterprise indexer consumes the AI queue when it is bundled
    ...(hasEnterpriseModule() ? [] : [EmbeddingProcessor]),
  ],
  exports: [EmbeddingIndexService, AttachmentTextService],
})
export class EmbeddingModule {}
