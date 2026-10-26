import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SearchService } from './search.service';
import {
  SearchDTO,
  SearchPublicSpaceDTO,
  SearchShareDTO,
  SearchSuggestionDTO,
} from './dto/search.dto';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { HybridSearchService } from './hybrid-search.service';
import { PublicSpaceService } from '../public-space/public-space.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly environmentService: EnvironmentService,
    private readonly publicSpaceService: PublicSpaceService,
    private readonly pageRepo: PageRepo,
    private readonly hybridSearch: HybridSearchService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  @OAuthScope('read')
  async pageSearch(
    @Body() searchDto: SearchDTO,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    delete searchDto.shareId;

    if (searchDto.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        searchDto.spaceId,
      );

      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    return this.hybridSearch.searchPages(searchDto, {
      userId: user.id,
      workspaceId: workspace.id,
    });
  }

  // What the search box can offer: semantic matches, attachment contents.
  @HttpCode(HttpStatus.OK)
  @Post('capabilities')
  async capabilities(@AuthWorkspace() workspace: Workspace) {
    return this.hybridSearch.capabilities(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('suggest')
  @OAuthScope('read')
  async searchSuggestions(
    @Body() dto: SearchSuggestionDTO,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.searchService.searchSuggestions(dto, user.id, workspace.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('share-search')
  async searchShare(
    @Body() searchDto: SearchShareDTO,
    @AuthWorkspace() workspace: Workspace,
  ) {
    delete searchDto.spaceId;
    if (!searchDto.shareId) {
      throw new BadRequestException('shareId is required');
    }

    return this.searchService.searchPage(searchDto, {
      workspaceId: workspace.id,
    });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('public-space-search')
  async searchPublicSpace(
    @Body() searchDto: SearchPublicSpaceDTO,
    @AuthWorkspace() workspace: Workspace,
  ) {
    delete searchDto.spaceId;
    delete searchDto.shareId;
    // Member-facing filters stay internal: creator identities and label
    // taxonomy must not become a grouping oracle on the anonymous surface.
    delete searchDto.creatorId;
    delete searchDto.labelIds;

    const { space } = await this.publicSpaceService.getPublicSpace(
      searchDto.spaceSlug,
      workspace,
    );
    const pages = await this.pageRepo.getSpacePagesExcludingRestricted(
      space.id,
    );
    const publicPageIds = pages.map((page) => page.id);

    return this.searchService.searchPage(searchDto, {
      workspaceId: workspace.id,
      publicPageIds,
    });
  }
}
