import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { ProviderApiError } from '../../registry/integration-provider.interface';
import { SprintBootService, toUnfurl } from './sprint-boot.service';
import {
  SprintBootAccess,
  SprintBootSyncService,
} from './sprint-boot-sync.service';
import {
  SprintBootAuthorizeDto,
  SprintBootCreateTicketDto,
  SprintBootLinkCompleteDto,
  SprintBootLinkPreviewDto,
  SprintBootLinkStateDto,
  SprintBootSearchDto,
  SprintBootStartLinkDto,
} from './sprint-boot.dto';
import { SprintBootLinkService } from './sprint-boot-link.service';

const NOT_INSTALLED = 'Sprint Boot is not connected to this workspace';

// Sprint Boot acts as the Docmost user, matched by email, so the person's own permissions apply there.
@UseGuards(JwtAuthGuard)
@Controller('integrations/sprint-boot')
export class SprintBootController {
  constructor(
    private readonly sync: SprintBootSyncService,
    private readonly sprintBootService: SprintBootService,
    private readonly link: SprintBootLinkService,
  ) {}

  // Settings > Integrations > Sprint Boot: off to Sprint Boot to authorize the link.
  @HttpCode(HttpStatus.OK)
  @Post('start-link')
  startLink(@Body() dto: SprintBootStartLinkDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.link.start(user, workspace, dto.sprintBootUrl);
  }

  // The authorize page for a link Sprint Boot started: its spaces.
  @HttpCode(HttpStatus.OK)
  @Post('link-preview')
  linkPreview(@Body() dto: SprintBootLinkPreviewDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.link.preview(user, workspace, dto.sprintBootUrl, dto.state);
  }

  @HttpCode(HttpStatus.OK)
  @Post('authorize')
  authorize(@Body() dto: SprintBootAuthorizeDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.link.authorize(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('spaces')
  async spaces(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    const access = await this.access(workspace.id);
    return this.call(() =>
      this.sprintBootService.getSpaces(access.token, access.baseUrl, user.email),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('search')
  async search(
    @Body() dto: SprintBootSearchDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const access = await this.access(workspace.id);
    const tickets = await this.call(() =>
      this.sprintBootService.search(access.token, access.baseUrl, {
        actorEmail: user.email,
        text: dto.query,
        spaceKey: dto.spaceKey,
        limit: dto.limit ?? 10,
      }),
    );
    return tickets.map((ticket) => toUnfurl(ticket, ticket.url));
  }

  @HttpCode(HttpStatus.OK)
  @Post('create-ticket')
  async createTicket(
    @Body() dto: SprintBootCreateTicketDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const access = await this.access(workspace.id);
    const ticket = await this.call(() =>
      this.sprintBootService.createTicket(access.token, access.baseUrl, {
        actorEmail: user.email,
        spaceKey: dto.spaceKey,
        type: dto.type,
        title: dto.title,
        description: dto.description,
      }),
    );
    return toUnfurl(ticket, ticket.url);
  }

  private async access(workspaceId: string): Promise<SprintBootAccess> {
    const access = await this.sync.findAccess(workspaceId);
    if (!access) {
      throw new BadRequestException(NOT_INSTALLED);
    }
    return access;
  }

  // Refusals from Sprint Boot (no account, no permission) come back as a 400 the client can show.
  private async call<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (err instanceof ProviderApiError && err.status < 500) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}

/** Sprint Boot's calls for a link started here. Public: the one-time state is the proof. */
@Controller('integrations/sprint-boot/link')
export class SprintBootLinkController {
  constructor(private readonly link: SprintBootLinkService) {}

  @HttpCode(HttpStatus.OK)
  @Post('request')
  request(@Body() dto: SprintBootLinkStateDto) {
    return this.link.linkRequest(dto.state);
  }

  @HttpCode(HttpStatus.OK)
  @Post('complete')
  complete(@Body() dto: SprintBootLinkCompleteDto) {
    return this.link.completeFromSprintBoot(dto.state, dto.sprintBootUrl, dto.bridgeSecret);
  }
}
