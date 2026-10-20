import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { SignupService } from '../auth/services/signup.service';
import { AuthService } from '../auth/services/auth.service';
import { validateAllowedEmail } from '../auth/auth.util';
import { isUserDisabled } from '../../common/helpers';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';

export type SsoSessionMetadata = {
  sso: { providerId: string; idToken: string };
};

export type SsoIdentity = {
  providerUserId: string;
  email: string | null | undefined;
  name?: string | null;
  emailVerified?: boolean;
  groups?: string[];
  // OIDC only: kept (encrypted) on the session for signing out of the IdP
  idToken?: string;
};

type LoginProvider = {
  id: string;
  type: string;
  allowSignup: boolean;
  groupSync: boolean;
};

// Turns an identity confirmed by any SSO provider into a Docmost session.
@Injectable()
export class SsoLoginService {
  private readonly logger = new Logger(SsoLoginService.name);

  constructor(
    private readonly userRepo: UserRepo,
    private readonly groupRepo: GroupRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly signupService: SignupService,
    private readonly authService: AuthService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async login(
    provider: LoginProvider,
    workspace: Workspace,
    identity: SsoIdentity,
  ): Promise<{ user: User; authToken: string }> {
    const user = await this.resolveUser(provider, workspace, identity);
    const authToken = await this.authService.completeLogin(
      user,
      workspace.id,
      `sso:${provider.type}`,
      identity.idToken
        ? ({
            sso: {
              providerId: provider.id,
              idToken: this.encryptionService.encrypt(
                identity.idToken,
                EncryptionPurpose.SSO_CREDENTIALS,
              ),
            },
          } satisfies SsoSessionMetadata)
        : undefined,
    );
    return { user, authToken };
  }

  // Finds or creates the Docmost user for a confirmed identity, links the
  // account and syncs groups, without issuing a session.
  async resolveUser(
    provider: LoginProvider,
    workspace: Workspace,
    identity: SsoIdentity,
  ): Promise<User> {
    const email = identity.email?.trim().toLowerCase();
    if (!email || !identity.providerUserId) {
      throw new BadRequestException(
        'The identity provider did not return an email address',
      );
    }
    if (identity.emailVerified === false) {
      throw new ForbiddenException(
        'Your email address is not verified with the identity provider',
      );
    }

    const user = await this.findOrCreateUser(provider, workspace, {
      ...identity,
      email,
    });
    if (isUserDisabled(user)) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    await this.authProviderRepo.linkAccount({
      providerId: provider.id,
      providerUserId: identity.providerUserId,
      userId: user.id,
      workspaceId: workspace.id,
    });

    // SCIM, when enabled, owns group membership
    if (
      provider.groupSync &&
      !workspace.isScimEnabled &&
      identity.groups?.length
    ) {
      await this.syncGroups(user, workspace, identity.groups);
    }
    return user;
  }

  private async findOrCreateUser(
    provider: LoginProvider,
    workspace: Workspace,
    identity: SsoIdentity & { email: string },
  ): Promise<User> {
    const account = await this.authProviderRepo.findAccount(
      provider.id,
      identity.providerUserId,
    );
    if (account) {
      const linked = await this.userRepo.findById(account.userId, workspace.id);
      if (linked) return linked;
    }

    const existing = await this.userRepo.findByEmail(
      identity.email,
      workspace.id,
    );
    if (existing) return existing;

    if (!provider.allowSignup) {
      throw new ForbiddenException(
        'No account exists for this email. Ask an admin to invite you.',
      );
    }
    validateAllowedEmail(identity.email, workspace);

    const name =
      identity.name?.trim().slice(0, 50) || identity.email.split('@')[0];
    // SSO users never type this password; it only satisfies the schema
    const created = await this.signupService.signup(
      {
        name,
        email: identity.email,
        password: randomBytes(32).toString('base64url'),
      },
      workspace.id,
    );
    await this.userRepo.updateUser(
      { hasGeneratedPassword: true, emailVerifiedAt: new Date() },
      created.id,
      workspace.id,
    );
    return created;
  }

  // Adds the user to existing groups named in the IdP's group claim. It
  // never removes memberships, so groups managed by hand stay intact.
  private async syncGroups(user: User, workspace: Workspace, groups: string[]) {
    const current = new Set(await this.groupUserRepo.getUserGroupIds(user.id));
    for (const name of new Set(groups.map((g) => g.trim()).filter(Boolean))) {
      try {
        const group = await this.groupRepo.findByName(name, workspace.id);
        if (group && !current.has(group.id)) {
          await this.groupUserRepo.addUserToGroup(
            user.id,
            group.id,
            workspace.id,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Group sync failed for "${name}": ${(err as Error)?.message}`,
        );
      }
    }
  }
}
