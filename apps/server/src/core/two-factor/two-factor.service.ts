import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserMfaRepo } from '@docmost/db/repos/user-mfa/user-mfa.repo';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import { comparePasswordHash } from '../../common/helpers';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditEventType,
  AuditResource,
} from '../../common/events/audit-events';

const ISSUER = 'Docmost';
const BACKUP_CODE_COUNT = 10;
// accept the previous and next 30s step to tolerate clock drift
const TOTP_WINDOW = 1;

export type LoginRequirement = 'none' | 'verify' | 'setup';

export function hashBackupCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/[\s-]/g, '').toLowerCase())
    .digest('hex');
}

function generateBackupCode(): string {
  // 10 hex chars shown as xxxxx-xxxxx
  const raw = randomBytes(5).toString('hex');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly userMfaRepo: UserMfaRepo,
    private readonly userRepo: UserRepo,
    private readonly encryptionService: EncryptionService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getStatus(user: User, workspaceId: string) {
    const mfa = await this.userMfaRepo.findByUser(user.id, workspaceId);
    const enabled = mfa?.isEnabled === true;
    return {
      isEnabled: enabled,
      method: enabled ? mfa.method : null,
      backupCodesRemaining: enabled ? (mfa.backupCodes?.length ?? 0) : 0,
    };
  }

  // What a password login still needs before a session is issued.
  async getLoginRequirement(
    user: User,
    workspace: Workspace,
  ): Promise<LoginRequirement> {
    const mfa = await this.userMfaRepo.findByUser(user.id, workspace.id);
    if (mfa?.isEnabled) return 'verify';
    if (workspace.enforceMfa) return 'setup';
    return 'none';
  }

  async beginSetup(user: User, workspace: Workspace) {
    const existing = await this.userMfaRepo.findByUser(user.id, workspace.id);
    if (existing?.isEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    await this.userMfaRepo.upsertPending({
      userId: user.id,
      workspaceId: workspace.id,
      secret: this.encryptionService.encrypt(
        secret.base32,
        EncryptionPurpose.MFA_SECRET,
      ),
    });

    const uri = this.buildTotp(secret.base32, user, workspace).toString();
    return {
      secret: secret.base32,
      otpauthUrl: uri,
      qrCodeDataUrl: await QRCode.toDataURL(uri),
    };
  }

  // Confirms the pending setup with a code and returns the backup codes once.
  async enable(user: User, workspace: Workspace, code: string) {
    const mfa = await this.userMfaRepo.findByUser(user.id, workspace.id);
    if (!mfa || mfa.isEnabled || !mfa.secret) {
      throw new BadRequestException('Start the setup first');
    }
    if (!this.isValidTotp(mfa.secret, user, workspace, code)) {
      throw new BadRequestException('Invalid verification code');
    }

    const backupCodes = this.newBackupCodes();
    await this.userMfaRepo.enable(mfa.id, backupCodes.map(hashBackupCode));
    this.audit(AuditEvent.USER_MFA_ENABLED, user);
    return { backupCodes };
  }

  async disable(user: User, workspace: Workspace, password: string) {
    await this.assertPassword(user, workspace.id, password);
    if (workspace.enforceMfa) {
      throw new BadRequestException(
        'Your workspace requires two-factor authentication',
      );
    }
    await this.userMfaRepo.delete(user.id, workspace.id);
    this.audit(AuditEvent.USER_MFA_DISABLED, user);
  }

  async regenerateBackupCodes(
    user: User,
    workspace: Workspace,
    password: string,
  ) {
    await this.assertPassword(user, workspace.id, password);
    const mfa = await this.userMfaRepo.findByUser(user.id, workspace.id);
    if (!mfa?.isEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    const backupCodes = this.newBackupCodes();
    await this.userMfaRepo.setBackupCodes(
      mfa.id,
      backupCodes.map(hashBackupCode),
    );
    this.audit(AuditEvent.USER_MFA_BACKUP_CODE_GENERATED, user);
    return { backupCodes };
  }

  // Accepts a TOTP code or an unused backup code (which is then consumed).
  async verifyLoginCode(
    user: User,
    workspace: Workspace,
    code: string,
  ): Promise<void> {
    const mfa = await this.userMfaRepo.findByUser(user.id, workspace.id);
    if (!mfa?.isEnabled || !mfa.secret) {
      throw new UnauthorizedException('Invalid verification code');
    }

    if (this.isValidTotp(mfa.secret, user, workspace, code)) return;

    const hashed = hashBackupCode(code ?? '');
    const remaining = mfa.backupCodes ?? [];
    const match = remaining.find((stored) => safeEqual(stored, hashed));
    if (!match) {
      this.auditService.log({
        event: AuditEvent.USER_LOGIN_FAILED,
        resourceType: AuditResource.USER,
        resourceId: user.id,
        metadata: { email: user.email, reason: 'wrong_mfa_code' },
      });
      throw new UnauthorizedException('Invalid verification code');
    }
    await this.userMfaRepo.setBackupCodes(
      mfa.id,
      remaining.filter((stored) => stored !== match),
    );
  }

  private audit(event: AuditEventType, user: User) {
    this.auditService.log({
      event,
      resourceType: AuditResource.USER,
      resourceId: user.id,
    });
  }

  private isValidTotp(
    encryptedSecret: string,
    user: User,
    workspace: Workspace,
    code: string,
  ): boolean {
    const token = (code ?? '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) return false;
    const secret = this.encryptionService.decrypt(
      encryptedSecret,
      EncryptionPurpose.MFA_SECRET,
    );
    return (
      this.buildTotp(secret, user, workspace).validate({
        token,
        window: TOTP_WINDOW,
      }) !== null
    );
  }

  private buildTotp(base32: string, user: User, workspace: Workspace) {
    return new OTPAuth.TOTP({
      issuer: workspace.name ? `${ISSUER} (${workspace.name})` : ISSUER,
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(base32),
    });
  }

  private newBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  }

  private async assertPassword(
    user: User,
    workspaceId: string,
    password: string,
  ) {
    const withPassword = await this.userRepo.findById(user.id, workspaceId, {
      includePassword: true,
    });
    const ok =
      !!password &&
      !!withPassword?.password &&
      (await comparePasswordHash(password, withPassword.password));
    if (!ok) {
      throw new BadRequestException('Incorrect password');
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
