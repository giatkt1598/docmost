import { Module, OnModuleInit } from '@nestjs/common';
import { GiteaProvider } from './gitea.provider';
import { GiteaService } from './gitea.service';
import { IntegrationRegistry } from '../../registry/integration-registry';
import { IntegrationModule } from '../../integration.module';

@Module({
  imports: [IntegrationModule],
  providers: [GiteaProvider, GiteaService],
  exports: [GiteaProvider],
})
export class GiteaModule implements OnModuleInit {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly giteaProvider: GiteaProvider,
  ) {}

  onModuleInit() {
    this.registry.register(this.giteaProvider);
  }
}
