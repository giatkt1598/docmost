import { Module } from '@nestjs/common';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { PageModule } from '../page/page.module';
import { AiPageEditService } from './ai-page-edit.service';
import { AiPageToolsService } from './ai-page-tools.service';
import { AiPageEditController } from './ai-page-edit.controller';
import { ReferenceResolver } from './reference-resolver';

@Module({
  imports: [CollaborationModule, PageModule],
  controllers: [AiPageEditController],
  providers: [AiPageEditService, AiPageToolsService, ReferenceResolver],
  exports: [AiPageToolsService],
})
export class AiToolsModule {}
