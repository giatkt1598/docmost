import { Global, Module } from '@nestjs/common';
import { PageAccessService } from './page-access.service';
import { PageLockService } from './page-lock.service';
import { TokenModule } from '../../auth/token.module';

@Global()
@Module({
  imports: [TokenModule],
  providers: [PageAccessService, PageLockService],
  exports: [PageAccessService, PageLockService],
})
export class PageAccessModule {}
