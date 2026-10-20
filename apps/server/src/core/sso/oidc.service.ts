import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as oidc from 'openid-client';
import { SsoIdentity } from './sso-login.service';

type OidcProvider = {
  id: string;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  updatedAt?: Date | string;
};

const DISCOVERY_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly discoveryCache = new Map<
    string,
    { config: oidc.Configuration; at: number }
  >();

  async buildLoginUrl(provider: OidcProvider, redirectUri: string) {
    const config = await this.getConfig(provider);
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      response_type: 'code',
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url: url.href, state, nonce, codeVerifier };
  }

  async handleCallback(
    provider: OidcProvider,
    callbackUrl: URL,
    expected: { state: string; nonce: string; codeVerifier: string },
  ): Promise<SsoIdentity> {
    const config = await this.getConfig(provider);
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: expected.codeVerifier,
      expectedState: expected.state,
      expectedNonce: expected.nonce,
      idTokenExpected: true,
    });

    let claims: Record<string, any> = tokens.claims() ?? {};
    if (!claims.email) {
      // some providers only put the email in the userinfo response
      claims = {
        ...claims,
        ...(await oidc.fetchUserInfo(config, tokens.access_token, claims.sub)),
      };
    }

    return {
      idToken: tokens.id_token,
      providerUserId: String(claims.sub),
      email: claims.email,
      name:
        claims.name ??
        ([claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
          null),
      emailVerified:
        claims.email_verified === undefined
          ? undefined
          : claims.email_verified === true || claims.email_verified === 'true',
      groups: Array.isArray(claims.groups)
        ? claims.groups.map(String)
        : undefined,
    };
  }

  // RP-initiated logout; null when the provider has no end_session_endpoint
  async buildLogoutUrl(
    provider: OidcProvider,
    idToken: string,
    postLogoutRedirectUri: string,
  ): Promise<string | null> {
    const config = await this.getConfig(provider);
    if (!config.serverMetadata().end_session_endpoint) return null;
    return oidc.buildEndSessionUrl(config, {
      id_token_hint: idToken,
      post_logout_redirect_uri: postLogoutRedirectUri,
      client_id: provider.oidcClientId,
    }).href;
  }

  private async getConfig(provider: OidcProvider): Promise<oidc.Configuration> {
    if (
      !provider.oidcIssuer ||
      !provider.oidcClientId ||
      !provider.oidcClientSecret
    ) {
      throw new BadRequestException(
        'This SSO provider is not fully configured',
      );
    }
    // the provider's updatedAt busts the cache after an edit
    const key = `${provider.id}:${provider.updatedAt ?? ''}`;
    const cached = this.discoveryCache.get(key);
    if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS)
      return cached.config;

    try {
      const config = await oidc.discovery(
        new URL(provider.oidcIssuer),
        provider.oidcClientId,
        provider.oidcClientSecret,
        undefined,
        // allow plain http issuers for local identity providers
        provider.oidcIssuer.startsWith('http://')
          ? { execute: [oidc.allowInsecureRequests] }
          : undefined,
      );
      this.discoveryCache.set(key, { config, at: Date.now() });
      return config;
    } catch (err) {
      this.logger.warn(
        `OIDC discovery failed for ${provider.oidcIssuer}: ${(err as Error)?.message}`,
      );
      throw new BadRequestException('Could not reach the identity provider');
    }
  }
}
