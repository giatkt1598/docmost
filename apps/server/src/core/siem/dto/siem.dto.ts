import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { SIEM_TYPES, SiemType } from '../siem.constants';

export class CreateSiemDestinationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsIn(SIEM_TYPES)
  type: SiemType;

  @IsObject()
  config: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class SiemDestinationIdDto {
  @IsUUID()
  destinationId: string;
}

export class UpdateSiemDestinationDto extends SiemDestinationIdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class TestSiemDestinationDto {
  @IsIn(SIEM_TYPES)
  type: SiemType;

  @IsObject()
  config: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, string>;

  @IsOptional()
  @IsUUID()
  destinationId?: string;
}
