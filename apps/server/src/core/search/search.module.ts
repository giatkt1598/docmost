import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchAttachmentsController } from './search-attachments.controller';
import { SearchService } from './search.service';
import { HybridSearchService } from './hybrid-search.service';
import { TypesenseService } from './typesense.service';
import { SearchIndexProcessor } from './search-index.processor';
import { PublicSpaceModule } from '../public-space/public-space.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { hasEnterpriseModule } from '../auth/auth-capabilities';

@Module({
  imports: [PublicSpaceModule, EmbeddingModule],
  controllers: [SearchController, SearchAttachmentsController],
  providers: [
    SearchService,
    HybridSearchService,
    TypesenseService,
    // the enterprise indexer consumes the search queue when it is bundled
    ...(hasEnterpriseModule() ? [] : [SearchIndexProcessor]),
  ],
  exports: [SearchService, HybridSearchService],
})
export class SearchModule {}
