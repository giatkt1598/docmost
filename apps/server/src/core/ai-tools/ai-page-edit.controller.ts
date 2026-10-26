import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AiPageToolsService } from './ai-page-tools.service';

class UndoAiEditDto {
  @IsUUID()
  editId: string;
}

// Undo button of the AI chat: same checks as the undo tool.
@UseGuards(JwtAuthGuard)
@Controller('ai-page-edits')
export class AiPageEditController {
  constructor(private readonly tools: AiPageToolsService) {}

  @HttpCode(HttpStatus.OK)
  @Post('undo')
  async undo(
    @Body() dto: UndoAiEditDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const result: any = await this.tools.undoAiEdit(
      { user, workspace },
      { edit_id: dto.editId },
    );
    if (result.error) {
      if (result.error.code === 'CONFLICT') {
        throw new ConflictException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return result;
  }
}
