import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SsoProviderController } from './sso-provider.controller';
import { SsoAuthController } from './sso-auth.controller';
import { SsoProviderService } from './sso-provider.service';
import { SsoLoginService } from './sso-login.service';
import { OidcService } from './oidc.service';

@Module({
  imports: [AuthModule],
  controllers: [SsoProviderController, SsoAuthController],
  providers: [SsoProviderService, SsoLoginService, OidcService],
  exports: [SsoProviderService, SsoLoginService],
})
export class SsoModule {}
