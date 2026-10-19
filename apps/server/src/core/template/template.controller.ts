import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { TemplateService } from './template.service';
import {
  CreateTemplateDto,
  ListTemplatesDto,
  TemplateIdDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';

// Served at /api/page-templates so it never collides with the enterprise /templates routes.
@UseGuards(JwtAuthGuard)
@Controller('page-templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  @OAuthScope('read')
  async list(
    @Body() dto: ListTemplatesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.list(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  @OAuthScope('read')
  async info(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.getInfo(dto.templateId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @OAuthScope('write')
  async create(
    @Body() dto: CreateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.create(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  @OAuthScope('write')
  async update(
    @Body() dto: UpdateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.update(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  @OAuthScope('write')
  async remove(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.templateService.remove(dto.templateId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('use')
  @OAuthScope('write')
  async use(
    @Body() dto: UseTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.use(dto, user, workspace);
  }
}
