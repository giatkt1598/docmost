import { Module } from '@nestjs/common';
import { PageModule } from '../page/page.module';
import { BaseController } from './base.controller';
import { BaseService } from './base.service';
import { BasePropertyService } from './base-property.service';
import { BaseRowService } from './base-row.service';
import { BaseViewService } from './base-view.service';
import { BaseExportService } from './base-export.service';
import { BaseReferenceService } from './base-reference.service';
import { BaseFormulaService } from './base-formula.service';
import { BaseConversionService } from './base-conversion.service';
import { BaseQueueProcessor } from './processors/base-queue.processor';
import { BaseWsService } from './realtime/base-ws.service';
import { BasePublicController } from './base-public.controller';
import { BasePublicService } from './base-public.service';
import { ShareModule } from '../share/share.module';
import { PublicSpaceModule } from '../public-space/public-space.module';
import { NotificationModule } from '../notification/notification.module';
import { BaseRowPageService } from './base-row-page.service';
import { BaseCsvImportService } from './base-csv-import.service';
import { BaseNotificationService } from './base-notification.service';

@Module({
  imports: [PageModule, ShareModule, PublicSpaceModule, NotificationModule],
  controllers: [BaseController, BasePublicController],
  providers: [
    BaseService,
    BasePublicService,
    BaseRowPageService,
    BaseCsvImportService,
    BaseNotificationService,
    BasePropertyService,
    BaseRowService,
    BaseViewService,
    BaseExportService,
    BaseReferenceService,
    BaseFormulaService,
    BaseConversionService,
    BaseQueueProcessor,
    BaseWsService,
  ],
  exports: [BaseService, BaseFormulaService, BaseConversionService],
})
export class BaseModule {}
