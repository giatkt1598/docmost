import {
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { FastifyReply } from 'fastify';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AuthService } from '../auth/services/auth.service';
import { clearMfaTokenCookie, setAuthCookie } from '../auth/auth-cookies';
import { TwoFactorService } from './two-factor.service';
import { MfaTokenGuard } from './mfa-token.guard';
import { TwoFactorCodeDto, TwoFactorPasswordDto } from './dto/two-factor.dto';

// Managing your own two-factor settings from a signed-in session.
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('two-factor')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @HttpCode(HttpStatus.OK)
  @Post('status')
  status(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.twoFactorService.getStatus(user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('setup')
  setup(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.twoFactorService.beginSetup(user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('enable')
  enable(
    @Body() dto: TwoFactorCodeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.twoFactorService.enable(user, workspace, dto.code);
  }

  @HttpCode(HttpStatus.OK)
  @Post('disable')
  async disable(
    @Body() dto: TwoFactorPasswordDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.twoFactorService.disable(user, workspace, dto.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('regenerate-backup-codes')
  regenerateBackupCodes(
    @Body() dto: TwoFactorPasswordDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.twoFactorService.regenerateBackupCodes(
      user,
      workspace,
      dto.password,
    );
  }
}

const MfaLogin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().mfaLogin as {
      user: User;
      workspace: Workspace;
    },
);

// The second step of a password login, authorized by the mfaToken cookie.
@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard, MfaTokenGuard)
@Controller('two-factor/login')
export class TwoFactorLoginController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    private readonly authService: AuthService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verify(
    @Body() dto: TwoFactorCodeDto,
    @MfaLogin() login: { user: User; workspace: Workspace },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.twoFactorService.verifyLoginCode(
      login.user,
      login.workspace,
      dto.code,
    );
    await this.finishLogin(login, res);
  }

  // Workspace enforces 2FA but the user has not set it up yet.
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  setup(@MfaLogin() login: { user: User; workspace: Workspace }) {
    return this.twoFactorService.beginSetup(login.user, login.workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('enable')
  async enable(
    @Body() dto: TwoFactorCodeDto,
    @MfaLogin() login: { user: User; workspace: Workspace },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.twoFactorService.enable(
      login.user,
      login.workspace,
      dto.code,
    );
    await this.finishLogin(login, res);
    return result;
  }

  private async finishLogin(
    login: { user: User; workspace: Workspace },
    res: FastifyReply,
  ) {
    const authToken = await this.authService.completeLogin(
      login.user,
      login.workspace.id,
      'password+totp',
    );
    clearMfaTokenCookie(res);
    setAuthCookie(res, authToken, this.environmentService);
  }
}
