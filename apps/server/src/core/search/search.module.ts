import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchIndexProcessor } from './search-index.processor';
import { PublicSpaceModule } from '../public-space/public-space.module';
import { hasEnterpriseModule } from '../auth/auth-capabilities';

@Module({
  imports: [PublicSpaceModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    // the enterprise indexer consumes the search queue when it is bundled
    ...(hasEnterpriseModule() ? [] : [SearchIndexProcessor]),
  ],
  exports: [SearchService],
})
export class SearchModule {}
