import { Module } from '@nestjs/common';
import { IntegrationRegistry } from './registry/integration-registry';
import { IntegrationService } from './integration.service';
import { IntegrationConnectionService } from './integration-connection.service';
import { IntegrationConfigService } from './integration-config.service';
import { IntegrationController } from './integration.controller';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { UnfurlController } from './unfurl/unfurl.controller';
import { UnfurlService } from './unfurl/unfurl.service';
import { IntegrationRepo } from './repos/integration.repo';
import { IntegrationConnectionRepo } from './repos/integration-connection.repo';
import { IntegrationConfigRepo } from './repos/integration-config.repo';
import { IntegrationListener } from './integration.listener';
import { IntegrationProcessor } from './integration.processor';
import { EnvironmentService } from '../../integrations/environment/environment.service';

@Module({
  controllers: [IntegrationController, OAuthController, UnfurlController],
  providers: [
    {
      provide: IntegrationRegistry,
      useFactory: (environmentService: EnvironmentService) =>
        new IntegrationRegistry(environmentService.isCloud()),
      inject: [EnvironmentService],
    },
    IntegrationService,
    IntegrationConnectionService,
    IntegrationConfigService,
    OAuthService,
    UnfurlService,
    IntegrationRepo,
    IntegrationConnectionRepo,
    IntegrationConfigRepo,
    IntegrationListener,
    IntegrationProcessor,
  ],
  exports: [
    IntegrationRegistry,
    IntegrationService,
    IntegrationConnectionService,
    IntegrationConfigService,
    OAuthService,
    IntegrationRepo,
    IntegrationConnectionRepo,
  ],
})
export class IntegrationModule {}
