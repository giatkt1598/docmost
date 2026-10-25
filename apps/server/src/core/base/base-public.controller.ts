import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BasePublicService } from './base-public.service';
import { PublicBaseDto, PublicListRowsDto } from './dto/base.dto';

// Read-only base endpoints for public shares and published spaces.
@UseGuards(JwtAuthGuard)
@Controller('bases/public')
export class BasePublicController {
  constructor(private readonly publicService: BasePublicService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@Body() dto: PublicBaseDto, @AuthWorkspace() workspace: Workspace) {
    return this.publicService.info(dto, workspace);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('rows')
  rows(@Body() dto: PublicListRowsDto, @AuthWorkspace() workspace: Workspace) {
    return this.publicService.rows(dto, workspace);
  }
}
