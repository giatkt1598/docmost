import { Module, OnModuleInit } from '@nestjs/common';
import { PenpotProvider } from './penpot.provider';
import { PenpotService } from './penpot.service';
import { IntegrationRegistry } from '../../registry/integration-registry';
import { IntegrationModule } from '../../integration.module';

@Module({
  imports: [IntegrationModule],
  providers: [PenpotProvider, PenpotService],
  exports: [PenpotProvider],
})
export class PenpotModule implements OnModuleInit {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly penpotProvider: PenpotProvider,
  ) {}

  onModuleInit() {
    this.registry.register(this.penpotProvider);
  }
}
