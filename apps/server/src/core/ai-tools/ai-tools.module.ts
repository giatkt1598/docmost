import { Module } from '@nestjs/common';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { PageModule } from '../page/page.module';
import { AiPageEditService } from './ai-page-edit.service';
import { AiPageToolsService } from './ai-page-tools.service';
import { AiPageEditController } from './ai-page-edit.controller';
import { ReferenceResolver } from './reference-resolver';
import { AttachmentWriter } from './attachment-writer';
import { DiagramPreparer } from './diagrams/diagram-preparer';
import { StorageModule } from '../../integrations/storage/storage.module';

@Module({
  imports: [CollaborationModule, PageModule, StorageModule],
  controllers: [AiPageEditController],
  providers: [
    AiPageEditService,
    AiPageToolsService,
    ReferenceResolver,
    AttachmentWriter,
    DiagramPreparer,
  ],
  exports: [AiPageToolsService, AttachmentWriter],
})
export class AiToolsModule {}
