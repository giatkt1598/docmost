import { Module, OnModuleInit } from '@nestjs/common';
import { IntegrationRegistry } from '../../registry/integration-registry';
import { IntegrationModule } from '../../integration.module';
import { SprintBootProvider } from './sprint-boot.provider';
import { SprintBootService } from './sprint-boot.service';
import { SprintBootSyncService } from './sprint-boot-sync.service';
import { SprintBootController, SprintBootLinkController } from './sprint-boot.controller';
import { SprintBootLinkService } from './sprint-boot-link.service';
import { ApiKeyModule } from '../../../api-key/api-key.module';
import { SpaceModule } from '../../../space/space.module';

@Module({
  imports: [IntegrationModule, ApiKeyModule, SpaceModule],
  controllers: [SprintBootController, SprintBootLinkController],
  providers: [SprintBootProvider, SprintBootService, SprintBootSyncService, SprintBootLinkService],
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
