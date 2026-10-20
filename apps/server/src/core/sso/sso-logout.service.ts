import { Injectable, Logger } from '@nestjs/common';
import { Workspace } from '@docmost/db/types/entity.types';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SsoProviderService } from './sso-provider.service';
import { OidcService } from './oidc.service';
import { SsoSessionMetadata } from './sso-login.service';
import { trustedReturnOrigin } from './sso-state';

// Signs the user out of the identity provider too when a Docmost session
// that came from OIDC ends.
@Injectable()
export class SsoLogoutService {
  private readonly logger = new Logger(SsoLogoutService.name);

  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly ssoProviderService: SsoProviderService,
    private readonly oidcService: OidcService,
    private readonly encryptionService: EncryptionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  // Never throws: a failing IdP must not stop a Docmost logout.
  async getLogoutUrl(
    sessionMetadata: unknown,
    workspace: Workspace,
    requestOrigin: string,
  ): Promise<string | null> {
    const sso = (sessionMetadata as Partial<SsoSessionMetadata>)?.sso;
    if (!sso?.providerId || !sso.idToken) return null;

    try {
      const origin = trustedReturnOrigin(
        requestOrigin,
        this.ssoProviderService.appUrl(workspace),
        this.environmentService.isDevelopment(),
      );
      const stored = await this.authProviderRepo.findById(
        sso.providerId,
        workspace.id,
      );
      if (!origin || !stored?.isEnabled) return null;
      if (stored.type !== 'oidc' && stored.type !== 'google') return null;

      const provider = await this.ssoProviderService.getForLogin(
        stored.id,
        workspace.id,
      );
      const idToken = this.encryptionService.decrypt(
        sso.idToken,
        EncryptionPurpose.SSO_CREDENTIALS,
      );
      return await this.oidcService.buildLogoutUrl(
        provider,
        idToken,
        `${origin}/login?logout=1`,
      );
    } catch (err) {
      this.logger.warn(`IdP logout skipped: ${(err as Error)?.message}`);
      return null;
    }
  }
}
