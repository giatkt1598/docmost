import { Module } from '@nestjs/common';
import { PageModule } from '../page/page.module';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateAttachmentService } from './template-attachment.service';

@Module({
  imports: [PageModule],
  controllers: [TemplateController],
  providers: [TemplateService, TemplateAttachmentService],
})
export class TemplateModule {}
