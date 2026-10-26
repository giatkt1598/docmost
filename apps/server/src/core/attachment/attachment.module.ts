import { Module } from '@nestjs/common';
import { AttachmentService } from './services/attachment.service';
import { AttachmentController } from './attachment.controller';
import { StorageModule } from '../../integrations/storage/storage.module';
import { UserModule } from '../user/user.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { AttachmentProcessor } from './processors/attachment.processor';
import { TokenModule } from '../auth/token.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { OrphanAttachmentCleanupService } from './services/orphan-attachment-cleanup.service';

@Module({
  imports: [
    StorageModule,
    UserModule,
    WorkspaceModule,
    TokenModule,
    EmbeddingModule,
  ],
  controllers: [AttachmentController],
  providers: [
    AttachmentService,
    AttachmentProcessor,
    OrphanAttachmentCleanupService,
  ],
  exports: [AttachmentService],
})
export class AttachmentModule {}
