import { Module } from '@nestjs/common';
import { PageVerificationController } from './page-verification.controller';
import { PageVerificationService } from './page-verification.service';
import { PageVerificationScheduler } from './page-verification.scheduler';

@Module({
  controllers: [PageVerificationController],
  providers: [PageVerificationService, PageVerificationScheduler],
  exports: [PageVerificationScheduler],
})
export class PageVerificationModule {}
