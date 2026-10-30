import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  SIEM_TEST_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import {
  CreateSiemDestinationDto,
  SiemDestinationIdDto,
  TestSiemDestinationDto,
  UpdateSiemDestinationDto,
} from './dto/siem.dto';
import { SiemService } from './siem.service';

@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('siem/destinations')
export class SiemController {
  constructor(
    private readonly siemService: SiemService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertCanManage(user, workspace);
    return this.siemService.list(workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @Body() dto: CreateSiemDestinationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.siemService.create(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(
    @Body() dto: UpdateSiemDestinationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.siemService.update(dto, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(
    @Body() dto: SiemDestinationIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    await this.siemService.remove(dto.destinationId, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('retry')
  async retry(
    @Body() dto: SiemDestinationIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    await this.siemService.retry(dto.destinationId, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @SkipThrottle({
    ...ALL_NAMED_THROTTLERS_SKIPPED,
    [SIEM_TEST_THROTTLER]: false,
  })
  @UseGuards(ThrottlerGuard)
  @Post('test')
  test(
    @Body() dto: TestSiemDestinationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanManage(user, workspace);
    return this.siemService.test(dto, workspace);
  }

  private assertCanManage(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }
  }
}
