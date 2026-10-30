import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import { hashBackupCode, TwoFactorService } from './two-factor.service';

jest.mock('../../common/helpers', () => ({
  comparePasswordHash: jest.fn(
    async (plain: string, hash: string) => hash === `hash:${plain}`,
  ),
}));

const user = { id: 'user_1', email: 'ann@example.com' } as any;
const workspace = { id: 'ws_1', name: 'Acme', enforceMfa: false } as any;

function createService() {
  let row: any = undefined;
  const userMfaRepo = {
    findByUser: jest.fn(async () => row),
    upsertPending: jest.fn(async (opts) => {
      row = {
        id: 'mfa_1',
        ...opts,
        method: 'totp',
        isEnabled: false,
        backupCodes: [],
      };
    }),
    enable: jest.fn(async (_id, backupCodes) => {
      row = { ...row, isEnabled: true, backupCodes };
    }),
    setBackupCodes: jest.fn(async (_id, backupCodes) => {
      row = { ...row, backupCodes };
    }),
    delete: jest.fn(async () => {
      row = undefined;
    }),
  };
  const userRepo = {
    findById: jest.fn(async () => ({
      ...user,
      password: 'hash:secret-password',
    })),
  };
  // identity "encryption" keeps the test independent of the app secret
  const encryptionService = {
    encrypt: jest.fn((plain: string) => `enc:${plain}`),
    decrypt: jest.fn((cipher: string) => cipher.replace(/^enc:/, '')),
  };
  const service = new TwoFactorService(
    userMfaRepo as any,
    userRepo as any,
    encryptionService as any,
    { log: jest.fn() } as any,
  );
  return { service, userMfaRepo, getRow: () => row };
}

function currentCode(secret: string, offsetSteps = 0) {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({
    timestamp: Date.now() + offsetSteps * 30_000,
  });
}

describe('TwoFactorService', () => {
  it('stores the secret encrypted and returns a QR code', async () => {
    const { service, getRow } = createService();

    const setup = await service.beginSetup(user, workspace);

    expect(setup.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(setup.otpauthUrl).toContain('otpauth://totp/');
    expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(getRow().secret).toBe(`enc:${setup.secret}`);
    expect(getRow().isEnabled).toBe(false);
  });

  it('enables with a valid code and returns 10 backup codes stored as hashes', async () => {
    const { service, getRow } = createService();
    const { secret } = await service.beginSetup(user, workspace);

    const { backupCodes } = await service.enable(
      user,
      workspace,
      currentCode(secret),
    );

    expect(backupCodes).toHaveLength(10);
    expect(getRow().isEnabled).toBe(true);
    expect(getRow().backupCodes).toEqual(backupCodes.map(hashBackupCode));
    expect(getRow().backupCodes).not.toContain(backupCodes[0]);
  });

  it('rejects a wrong code when enabling', async () => {
    const { service } = createService();
    await service.beginSetup(user, workspace);

    await expect(service.enable(user, workspace, '000000')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts codes from the adjacent time step but not further away', async () => {
    const { service } = createService();
    const { secret } = await service.beginSetup(user, workspace);
    await service.enable(user, workspace, currentCode(secret));

    await expect(
      service.verifyLoginCode(user, workspace, currentCode(secret, -1)),
    ).resolves.toBeUndefined();
    await expect(
      service.verifyLoginCode(user, workspace, currentCode(secret, -5)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('consumes a backup code so it works only once', async () => {
    const { service } = createService();
    const { secret } = await service.beginSetup(user, workspace);
    const { backupCodes } = await service.enable(
      user,
      workspace,
      currentCode(secret),
    );

    await expect(
      service.verifyLoginCode(user, workspace, backupCodes[3].toUpperCase()),
    ).resolves.toBeUndefined();
    await expect(
      service.verifyLoginCode(user, workspace, backupCodes[3]),
    ).rejects.toThrow(UnauthorizedException);
    expect((await service.getStatus(user, 'ws_1')).backupCodesRemaining).toBe(
      9,
    );
  });

  it('works out what a login still needs', async () => {
    const { service } = createService();

    expect(await service.getLoginRequirement(user, workspace)).toBe('none');
    expect(
      await service.getLoginRequirement(user, {
        ...workspace,
        enforceMfa: true,
      }),
    ).toBe('setup');

    const { secret } = await service.beginSetup(user, workspace);
    await service.enable(user, workspace, currentCode(secret));
    expect(await service.getLoginRequirement(user, workspace)).toBe('verify');
  });

  it('disables only with the right password and when not enforced', async () => {
    const { service, userMfaRepo } = createService();
    const { secret } = await service.beginSetup(user, workspace);
    await service.enable(user, workspace, currentCode(secret));

    await expect(service.disable(user, workspace, 'wrong')).rejects.toThrow(
      'Incorrect password',
    );
    await expect(
      service.disable(
        user,
        { ...workspace, enforceMfa: true },
        'secret-password',
      ),
    ).rejects.toThrow('requires two-factor');
    await service.disable(user, workspace, 'secret-password');
    expect(userMfaRepo.delete).toHaveBeenCalled();
  });

  it('refuses to start a new setup while 2FA is enabled', async () => {
    const { service } = createService();
    const { secret } = await service.beginSetup(user, workspace);
    await service.enable(user, workspace, currentCode(secret));

    await expect(service.beginSetup(user, workspace)).rejects.toThrow(
      'already enabled',
    );
  });
});
