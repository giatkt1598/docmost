import { Module } from '@nestjs/common';
import { ImportService } from './services/import.service';
import { ImportController } from './import.controller';
import { StorageModule } from '../storage/storage.module';
import { FileImportTaskService } from './services/file-import-task.service';
import { FileTaskProcessor } from './processors/file-task.processor';
import { ImportAttachmentService } from './services/import-attachment.service';
import { ImportImageService } from './services/import-image.service';
import { DocxImportService } from './services/docx-import.service';
import { PdfImportService } from './services/pdf-import.service';
import { ConfluenceImportService } from './services/confluence-import.service';
import { FileTaskController } from './file-task.controller';
import { PageModule } from '../../core/page/page.module';
import { BaseTransferService } from '../../core/base/base-transfer.service';
import { BaseReferenceService } from '../../core/base/base-reference.service';

@Module({
  providers: [
    ImportService,
    FileImportTaskService,
    FileTaskProcessor,
    ImportAttachmentService,
    ImportImageService,
    ConfluenceImportService,
    DocxImportService,
    PdfImportService,
    BaseTransferService,
    BaseReferenceService,
  ],
  exports: [ImportService, ImportAttachmentService],
  controllers: [ImportController, FileTaskController],
  imports: [StorageModule, PageModule],
})
export class ImportModule {}
