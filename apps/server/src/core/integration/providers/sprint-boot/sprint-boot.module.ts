import { Module, OnModuleInit } from '@nestjs/common';
import { IntegrationRegistry } from '../../registry/integration-registry';
import { IntegrationModule } from '../../integration.module';
import { SprintBootProvider } from './sprint-boot.provider';
import { SprintBootService } from './sprint-boot.service';
import { SprintBootSyncService } from './sprint-boot-sync.service';
import { SprintBootController } from './sprint-boot.controller';

@Module({
  imports: [IntegrationModule],
  controllers: [SprintBootController],
  providers: [SprintBootProvider, SprintBootService, SprintBootSyncService],
  exports: [SprintBootProvider],
})
export class SprintBootModule implements OnModuleInit {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly sprintBootProvider: SprintBootProvider,
  ) {}

  onModuleInit() {
    this.registry.register(this.sprintBootProvider);
  }
}
