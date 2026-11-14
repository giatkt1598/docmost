import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../../integrations/throttle/throttler-names';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../../common/events/audit-events';
import { PagePasswordService } from './page-password.service';
import {
  PagePasswordPageIdDto,
  SetPagePasswordDto,
  UnlockPageDto,
} from './dto/page-password.dto';
import {
  PAGE_UNLOCK_TTL_MS,
  pageUnlockCookieName,
} from '../page-access/page-lock.constants';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PagePasswordController {
  constructor(
    private readonly pagePasswordService: PagePasswordService,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  // The unlock lives in an httpOnly cookie, so image and file requests of
  // the page carry it too.
  private setUnlockCookie(res: FastifyReply, pageId: string, token: string) {
    res.setCookie(pageUnlockCookieName(pageId), token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(Date.now() + PAGE_UNLOCK_TTL_MS),
      secure: this.environmentService.isHttps(),
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/set')
  async setPassword(
    @Body() dto: SetPagePasswordDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { page, unlockToken } = await this.pagePasswordService.setPassword(
      dto.pageId,
      { password: dto.password, includeSubPages: dto.includeSubPages },
      user,
      workspace.id,
    );
    if (unlockToken) this.setUnlockCookie(res, page.id, unlockToken);

    this.auditService.log({
      event: AuditEvent.PAGE_PASSWORD_SET,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
    });

    return { hasPassword: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/remove')
  async removePassword(
    @Body() dto: PagePasswordPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const page = await this.pagePasswordService.removePassword(
      dto.pageId,
      user,
      workspace.id,
    );
    res.clearCookie(pageUnlockCookieName(page.id), { path: '/' });

    this.auditService.log({
      event: AuditEvent.PAGE_PASSWORD_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
    });

    return { hasPassword: false };
  }

  // Public for share and public-space visitors; throttled against guessing.
  @Public()
  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('unlock')
  async unlock(
    @Body() dto: UnlockPageDto,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { page, unlockToken } = await this.pagePasswordService.unlock(
      dto.pageId,
      dto.password,
      workspace.id,
    );
    if (unlockToken) this.setUnlockCookie(res, page.id, unlockToken);
    return { unlocked: true };
  }
}
