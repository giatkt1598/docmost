import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  // omitted: the key never expires
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateApiKeyDto {
  @IsUUID()
  apiKeyId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;
}

export class ApiKeyIdDto {
  @IsUUID()
  apiKeyId: string;
}

// PaginationOptions.adminView: every key of the workspace (admins only)
export class ListApiKeysDto extends PaginationOptions {}
