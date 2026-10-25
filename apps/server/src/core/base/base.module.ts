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

@Module({
  imports: [PageModule],
  controllers: [BaseController],
  providers: [
    BaseService,
    BasePropertyService,
    BaseRowService,
    BaseViewService,
    BaseExportService,
    BaseReferenceService,
    BaseFormulaService,
    BaseConversionService,
  ],
  exports: [BaseService, BaseFormulaService, BaseConversionService],
})
export class BaseModule {}
