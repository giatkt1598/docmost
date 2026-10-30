import { Module } from '@nestjs/common';
import { TokenModule } from '../auth/token.module';
import { NotificationModule } from '../notification/notification.module';
import { SiemController } from './siem.controller';
import { SiemDeliveryService } from './siem-delivery.service';
import { SiemProcessor } from './siem.processor';
import { SiemService } from './siem.service';
import { SiemTransportService } from './siem-transport.service';

// Imported only when the enterprise module, which has its own streaming
// implementation, is not bundled.
@Module({
  imports: [TokenModule, NotificationModule],
  controllers: [SiemController],
  providers: [
    SiemService,
    SiemDeliveryService,
    SiemTransportService,
    SiemProcessor,
  ],
})
export class SiemModule {}
