import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SignupService } from './services/signup.service';
import { TokenModule } from './token.module';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { MfaTokenGuard } from '../two-factor/mfa-token.guard';
import {
  TwoFactorController,
  TwoFactorLoginController,
} from '../two-factor/two-factor.controller';

@Module({
  imports: [TokenModule, WorkspaceModule],
  controllers: [AuthController, TwoFactorController, TwoFactorLoginController],
  providers: [
    AuthService,
    SignupService,
    JwtStrategy,
    TwoFactorService,
    MfaTokenGuard,
  ],
  exports: [SignupService, AuthService, TwoFactorService],
})
export class AuthModule {}
