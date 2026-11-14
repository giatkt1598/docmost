import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetPagePasswordDto {
  @IsUUID()
  pageId: string;

  // left out to change only includeSubPages of an existing password
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(72)
  password?: string;

  // the password covers the sub-pages too
  @IsOptional()
  @IsBoolean()
  includeSubPages?: boolean;
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
