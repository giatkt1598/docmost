import { FastifyReply } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';

export const MFA_TOKEN_COOKIE = 'mfaToken';
const MFA_TOKEN_TTL_MS = 5 * 60 * 1000;

export function setAuthCookie(
  res: FastifyReply,
  token: string,
  environmentService: EnvironmentService,
) {
  res.setCookie('authToken', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: environmentService.getCookieExpiresIn(),
    secure: environmentService.isHttps(),
  });
}

// Short-lived proof that the password step passed; only the two-factor
// login endpoints accept it.
export function setMfaTokenCookie(
  res: FastifyReply,
  token: string,
  environmentService: EnvironmentService,
) {
  res.setCookie(MFA_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/two-factor/login',
    expires: new Date(Date.now() + MFA_TOKEN_TTL_MS),
    secure: environmentService.isHttps(),
  });
}

export function clearMfaTokenCookie(res: FastifyReply) {
  res.clearCookie(MFA_TOKEN_COOKIE, { path: '/api/two-factor/login' });
}
