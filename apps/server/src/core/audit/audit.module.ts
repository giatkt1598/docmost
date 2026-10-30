import { Global, Module } from '@nestjs/common';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { TokenModule } from '../auth/token.module';
import { AuditController } from './audit.controller';
import { AuditLogService } from './audit-log.service';
import { AuditProcessor } from './audit.processor';
import { AuditWriterService } from './audit-writer.service';

// Imported only when the enterprise module, which has its own audit
// implementation, is not bundled.
@Global()
@Module({
  imports: [TokenModule],
  controllers: [AuditController],
  providers: [
    AuditLogService,
    AuditProcessor,
    { provide: AUDIT_SERVICE, useClass: AuditWriterService },
  ],
  exports: [AUDIT_SERVICE],
})
export class AuditModule {}
