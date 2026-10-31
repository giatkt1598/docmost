import { Module, OnModuleInit } from '@nestjs/common';
import { JiraProvider } from './jira.provider';
import { JiraService } from './jira.service';
import { IntegrationRegistry } from '../../registry/integration-registry';
import { IntegrationModule } from '../../integration.module';

@Module({
  imports: [IntegrationModule],
  providers: [JiraProvider, JiraService],
  exports: [JiraProvider],
})
export class JiraModule implements OnModuleInit {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly jiraProvider: JiraProvider,
  ) {}

  onModuleInit() {
    this.registry.register(this.jiraProvider);
  }
}
