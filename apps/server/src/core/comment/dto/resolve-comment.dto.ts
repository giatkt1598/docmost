import { IsBoolean, IsUUID } from 'class-validator';

export class SetCommentResolvedDto {
  @IsUUID()
  commentId: string;

  @IsBoolean()
  resolved: boolean;
}
