import { Global, Module } from '@nestjs/common';
import { TemplateAccessService } from './template-access.service';

// Global so the attachment endpoints can check template access without
// importing the template module (which depends on PageModule).
@Global()
@Module({
  providers: [TemplateAccessService],
  exports: [TemplateAccessService],
})
export class TemplateAccessModule {}
