import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token.module';
import { SsoProviderController } from './sso-provider.controller';
import { SsoAuthController } from './sso-auth.controller';
import { SsoProviderService } from './sso-provider.service';
import { SsoLoginService } from './sso-login.service';
import { OidcService } from './oidc.service';
import { LdapService } from './ldap.service';
import { SamlService } from './saml.service';
import { SsoLogoutService } from './sso-logout.service';

@Module({
  imports: [AuthModule, TokenModule],
  controllers: [SsoProviderController, SsoAuthController],
  providers: [
    SsoProviderService,
    SsoLoginService,
    OidcService,
    LdapService,
    SamlService,
    SsoLogoutService,
  ],
  exports: [SsoProviderService, SsoLoginService, SsoLogoutService],
})
export class SsoModule {}
