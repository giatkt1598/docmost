import { IsNotEmpty, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SetPagePasswordDto {
  @IsUUID()
  pageId: string;

  @IsString()
  @MinLength(4)
  @MaxLength(72)
  password: string;
}

export class PagePasswordPageIdDto {
  @IsUUID()
  pageId: string;
}

export class UnlockPageDto {
  @IsUUID()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
