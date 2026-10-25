import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { StorageModule } from '../storage/storage.module';
import { BaseTransferService } from '../../core/base/base-transfer.service';
import { BaseReferenceService } from '../../core/base/base-reference.service';

@Module({
  imports: [StorageModule],
  providers: [ExportService, BaseTransferService, BaseReferenceService],
  controllers: [ExportController],
})
export class ExportModule {}
