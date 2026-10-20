import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { EncryptionService } from '../../integrations/encryption/encryption.service';
import { setAuthCookie, setMfaTokenCookie } from '../auth/auth-cookies';
import { TokenService } from '../auth/services/token.service';
import { AuthService } from '../auth/services/auth.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { SsoProviderService } from './sso-provider.service';
import { SsoLoginService } from './sso-login.service';
import { OidcService } from './oidc.service';
import { LdapService } from './ldap.service';
import { SamlService } from './saml.service';
import { LdapLoginDto } from './dto/sso-provider.dto';
import {
  openSsoState,
  safeRedirectPath,
  sealSsoState,
  SsoState,
  trustedReturnOrigin,
} from './sso-state';

const STATE_COOKIE = 'ssoState';
const STATE_COOKIE_PATH = '/api/auth-sso';

// Browser-facing SSO login flows. Errors send the user back to /login with
// a readable message instead of a JSON response.
// Only the LDAP password check is rate limited; the redirect steps are
// bounded by the identity provider.
@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('auth-sso')
export class SsoAuthController {
  private readonly logger = new Logger(SsoAuthController.name);

  constructor(
    private readonly ssoProviderService: SsoProviderService,
    private readonly ssoLoginService: SsoLoginService,
    private readonly oidcService: OidcService,
    private readonly ldapService: LdapService,
    private readonly samlService: SamlService,
    private readonly twoFactorService: TwoFactorService,
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
    private readonly encryptionService: EncryptionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @Get(':providerId/login')
  async login(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Query('redirect') redirect: string,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const origin = this.returnOrigin(req, workspace);
    try {
      const provider = await this.ssoProviderService.getForLogin(
        providerId,
        workspace.id,
      );
      if (provider.type === 'saml') {
        // the IdP posts back cross-site, where a lax cookie is not sent, so
        // the state travels in RelayState instead
        const relayState = sealSsoState(this.encryptionService, {
          providerId,
          redirect: safeRedirectPath(redirect),
          origin,
        });
        const url = await this.samlService.buildLoginUrl(
          provider,
          this.ssoProviderService.samlUrls(provider, workspace),
          relayState,
        );
        return res.redirect(url, 302);
      }
      if (provider.type !== 'oidc' && provider.type !== 'google') {
        return this.fail(
          res,
          'This SSO provider does not use a redirect login',
          origin,
        );
      }

      const login = await this.oidcService.buildLoginUrl(
        provider,
        this.ssoProviderService.callbackUrl(provider, workspace),
      );
      res.setCookie(
        STATE_COOKIE,
        sealSsoState(this.encryptionService, {
          providerId,
          redirect: safeRedirectPath(redirect),
          origin,
          state: login.state,
          nonce: login.nonce,
          codeVerifier: login.codeVerifier,
        }),
        {
          httpOnly: true,
          sameSite: 'lax',
          path: STATE_COOKIE_PATH,
          secure: this.environmentService.isHttps(),
          maxAge: 600,
        },
      );
      return res.redirect(login.url, 302);
    } catch (err) {
      return this.fail(res, err, origin);
    }
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @Get(':providerId/callback')
  async callback(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const state = openSsoState(
      this.encryptionService,
      (req.cookies as Record<string, string>)?.[STATE_COOKIE],
      providerId,
    );
    res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });
    if (!state?.state || !state.codeVerifier) {
      return this.fail(res, 'Your sign-in attempt expired. Please try again.');
    }

    try {
      const provider = await this.ssoProviderService.getForLogin(
        providerId,
        workspace.id,
      );
      // rebuild the URL the IdP redirected to from the registered callback
      const callbackUrl = new URL(
        this.ssoProviderService.callbackUrl(provider, workspace),
      );
      callbackUrl.search = new URL(req.url, 'http://local').search;

      const identity = await this.oidcService.handleCallback(
        provider,
        callbackUrl,
        {
          state: state.state,
          nonce: state.nonce,
          codeVerifier: state.codeVerifier,
        },
      );
      const { authToken } = await this.ssoLoginService.login(
        provider,
        workspace,
        identity,
      );
      setAuthCookie(res, authToken, this.environmentService);
      return this.redirectAfterLogin(res, state);
    } catch (err) {
      return this.fail(res, err, state.origin);
    }
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @Post(':providerId/saml/callback')
  async samlCallback(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: Record<string, string>,
    @Res() res: FastifyReply,
  ) {
    const state = openSsoState(
      this.encryptionService,
      body?.RelayState,
      providerId,
    );
    if (!state || typeof body?.SAMLResponse !== 'string') {
      return this.fail(res, 'Your sign-in attempt expired. Please try again.');
    }

    try {
      const provider = await this.ssoProviderService.getForLogin(
        providerId,
        workspace.id,
      );
      if (provider.type !== 'saml') {
        return this.fail(res, 'SSO provider not found', state.origin);
      }
      let identity;
      try {
        identity = await this.samlService.handleCallback(
          provider,
          this.ssoProviderService.samlUrls(provider, workspace),
          { SAMLResponse: body.SAMLResponse },
        );
      } catch (err) {
        this.logger.warn(`SAML response rejected: ${(err as Error)?.message}`);
        return this.fail(
          res,
          'The SAML response could not be verified',
          state.origin,
        );
      }
      const { authToken } = await this.ssoLoginService.login(
        provider,
        workspace,
        identity,
      );
      setAuthCookie(res, authToken, this.environmentService);
      return this.redirectAfterLogin(res, state);
    } catch (err) {
      return this.fail(res, err, state.origin);
    }
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @Get(':providerId/saml/metadata')
  async samlMetadata(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const provider = await this.ssoProviderService.getSamlProvider(
      providerId,
      workspace.id,
    );
    const xml = this.samlService.metadata(
      provider,
      this.ssoProviderService.samlUrls(provider, workspace),
    );
    return res.type('application/xml').send(xml);
  }

  // LDAP has no redirect: the login page posts the directory credentials.
  // The response matches the password login, including the two-factor step.
  @HttpCode(HttpStatus.OK)
  @Post(':providerId/ldap-login')
  async ldapLogin(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: LdapLoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const provider = await this.ssoProviderService.getForLogin(
      providerId,
      workspace.id,
    );
    if (provider.type !== 'ldap') {
      throw new HttpException('SSO provider not found', HttpStatus.NOT_FOUND);
    }

    const identity = await this.ldapService.authenticate(
      provider,
      dto.username,
      dto.password,
    );
    const user = await this.ssoLoginService.resolveUser(
      provider,
      workspace,
      identity,
    );

    const requirement = await this.twoFactorService.getLoginRequirement(
      user,
      workspace,
    );
    if (requirement !== 'none') {
      setMfaTokenCookie(
        res,
        await this.tokenService.generateMfaToken(user, workspace.id),
        this.environmentService,
      );
      return requirement === 'verify'
        ? {
            userHasMfa: true,
            requiresMfaSetup: false,
            isMfaEnforced: !!workspace.enforceMfa,
          }
        : { userHasMfa: false, requiresMfaSetup: true, isMfaEnforced: true };
    }

    const authToken = await this.authService.completeLogin(
      user,
      workspace.id,
      'sso:ldap',
    );
    setAuthCookie(res, authToken, this.environmentService);
  }

  private returnOrigin(req: FastifyRequest, workspace: Workspace) {
    return trustedReturnOrigin(
      `${req.protocol}://${req.headers.host}`,
      this.ssoProviderService.appUrl(workspace),
      this.environmentService.isDevelopment(),
    );
  }

  private redirectAfterLogin(res: FastifyReply, state: SsoState) {
    return res.redirect(`${state.origin ?? ''}${state.redirect}`, 302);
  }

  private fail(res: FastifyReply, err: unknown, origin?: string) {
    const message =
      typeof err === 'string'
        ? err
        : err instanceof HttpException
          ? err.message
          : 'SSO sign-in failed';
    if (!(typeof err === 'string' || err instanceof HttpException)) {
      this.logger.error(err);
    }
    return res.redirect(
      `${origin ?? ''}/login?ssoError=${encodeURIComponent(message)}`,
      302,
    );
  }
}
