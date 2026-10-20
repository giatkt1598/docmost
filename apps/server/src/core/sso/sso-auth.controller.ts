import {
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { EncryptionService } from '../../integrations/encryption/encryption.service';
import { setAuthCookie } from '../auth/auth-cookies';
import { SsoProviderService } from './sso-provider.service';
import { SsoLoginService } from './sso-login.service';
import { OidcService } from './oidc.service';
import { openSsoState, safeRedirectPath, sealSsoState } from './sso-state';

const STATE_COOKIE = 'ssoState';
const STATE_COOKIE_PATH = '/api/auth-sso';

// Browser-facing SSO login flows. Errors send the user back to /login with
// a readable message instead of a JSON response.
@UseGuards(ThrottlerGuard)
@Controller('auth-sso')
export class SsoAuthController {
  private readonly logger = new Logger(SsoAuthController.name);

  constructor(
    private readonly ssoProviderService: SsoProviderService,
    private readonly ssoLoginService: SsoLoginService,
    private readonly oidcService: OidcService,
    private readonly encryptionService: EncryptionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @Get(':providerId/login')
  async login(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Query('redirect') redirect: string,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    try {
      const provider = await this.ssoProviderService.getForLogin(
        providerId,
        workspace.id,
      );
      if (provider.type !== 'oidc' && provider.type !== 'google') {
        return this.fail(
          res,
          'This SSO provider does not use a redirect login',
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
      return this.fail(res, err);
    }
  }

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
      return res.redirect(state.redirect, 302);
    } catch (err) {
      return this.fail(res, err);
    }
  }

  private fail(res: FastifyReply, err: unknown) {
    const message =
      typeof err === 'string'
        ? err
        : err instanceof HttpException
          ? err.message
          : 'SSO sign-in failed';
    if (!(typeof err === 'string' || err instanceof HttpException)) {
      this.logger.error(err);
    }
    return res.redirect(`/login?ssoError=${encodeURIComponent(message)}`, 302);
  }
}
