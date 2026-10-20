import { BadRequestException } from '@nestjs/common';
import { AuthService } from './services/auth.service';
import {
  CORE_MFA_SUPPORTED,
  CORE_SSO_PROVIDER_TYPES,
  isMfaSupported,
  isSsoProviderTypeSupported,
} from './auth-capabilities';

describe('auth capabilities without the enterprise build', () => {
  it('reports MFA support only when an implementation exists', () => {
    // the ee submodule is not bundled in this checkout
    expect(isMfaSupported()).toBe(CORE_MFA_SUPPORTED);
  });

  it('only supports SSO provider types core implements', () => {
    for (const type of ['oidc', 'google', 'saml', 'ldap']) {
      expect(isSsoProviderTypeSupported(type)).toBe(
        CORE_SSO_PROVIDER_TYPES.includes(type),
      );
    }
  });
});

describe('AuthService.assertPasswordLoginAllowed', () => {
  function check(user: any, enforceSso: boolean) {
    const fakeThis = {
      userRepo: { findByEmail: jest.fn().mockResolvedValue(user) },
    };
    return AuthService.prototype.assertPasswordLoginAllowed.call(
      fakeThis,
      'a@example.com',
      { id: 'ws_1', enforceSso } as any,
    );
  }

  it('allows password login when SSO is not enforced', async () => {
    await expect(check({ role: 'member' }, false)).resolves.toBeUndefined();
  });

  it('blocks members when SSO is enforced', async () => {
    await expect(check({ role: 'member' }, true)).rejects.toThrow(
      BadRequestException,
    );
    await expect(check(undefined, true)).rejects.toThrow(BadRequestException);
  });

  it('always lets the workspace owner use their password', async () => {
    await expect(check({ role: 'owner' }, true)).resolves.toBeUndefined();
  });

  it('does not let a deactivated owner bypass SSO', async () => {
    await expect(
      check({ role: 'owner', deactivatedAt: new Date() }, true),
    ).rejects.toThrow(BadRequestException);
  });
});
