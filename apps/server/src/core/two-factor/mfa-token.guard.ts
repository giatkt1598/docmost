import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { TokenService } from '../auth/services/token.service';
import { JwtType } from '../auth/dto/jwt-payload';
import { MFA_TOKEN_COOKIE } from '../auth/auth-cookies';
import { isUserDisabled } from '../../common/helpers';

// Lets a user who passed the password step finish the two-factor step.
@Injectable()
export class MfaTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = req.cookies?.[MFA_TOKEN_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Your sign-in session has expired');
    }

    let payload: { sub: string; workspaceId: string };
    try {
      payload = await this.tokenService.verifyJwt(token, JwtType.MFA_TOKEN);
    } catch {
      throw new UnauthorizedException('Your sign-in session has expired');
    }

    if (req.raw?.workspaceId && req.raw.workspaceId !== payload.workspaceId) {
      throw new UnauthorizedException();
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!workspace || !user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    req.mfaLogin = { user, workspace };
    return true;
  }
}
