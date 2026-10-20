import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { nanoIdGen } from '../../common/helpers/nanoid.utils';
import { SpaceService } from './services/space.service';
import { CreatePersonalSpaceDto } from './dto/create-personal-space.dto';

// A slug that satisfies CreateSpaceDto: letters/digits/hyphens, starting
// with a letter or digit. The suffix keeps it unique across users.
export function personalSpaceSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `${base || 'personal'}-${nanoIdGen().slice(0, 6)}`;
}

export function personalSpacesAllowed(workspace: Workspace): boolean {
  const settings = workspace.settings as {
    spaces?: { allowPersonal?: boolean };
  } | null;
  return settings?.spaces?.allowPersonal === true;
}

// Every member can create one space only they can access. Turning the
// workspace setting off stops new ones; existing spaces stay.
@UseGuards(JwtAuthGuard)
@Controller('personal-space')
export class PersonalSpaceController {
  constructor(
    private readonly spaceService: SpaceService,
    private readonly spaceRepo: SpaceRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    const space = await this.spaceRepo.findPersonalSpace(user.id, workspace.id);
    if (!space) return null;

    const roles = await this.spaceMemberRepo.getUserSpaceRoles(
      user.id,
      space.id,
    );
    return {
      ...space,
      membership: { userId: user.id, role: findHighestUserSpaceRole(roles) },
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreatePersonalSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (!personalSpacesAllowed(workspace)) {
      throw new ForbiddenException(
        'Personal spaces are not enabled in this workspace',
      );
    }
    if (await this.spaceRepo.findPersonalSpace(user.id, workspace.id)) {
      throw new BadRequestException('You already have a personal space');
    }

    const name =
      dto.name || `${user.name?.trim().split(/\s+/)[0] || 'My'}'s space`;
    try {
      return await this.spaceService.createSpace(
        user,
        workspace.id,
        { name, slug: personalSpaceSlug(name) },
        undefined,
        { isPersonal: true },
      );
    } catch (err) {
      // the unique index catches a second, concurrent request
      if ((err as Error)?.message?.includes('spaces_personal_creator_unique')) {
        throw new BadRequestException('You already have a personal space');
      }
      throw err;
    }
  }
}
