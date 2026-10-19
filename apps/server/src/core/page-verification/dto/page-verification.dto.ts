import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MAX_VERIFIERS,
  PERIOD_UNITS,
  PeriodUnit,
  VERIFICATION_MODES,
  VerificationMode,
} from '../page-verification.utils';

export class PageVerificationPageIdDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class CreatePageVerificationDto extends PageVerificationPageIdDto {
  @IsIn(VERIFICATION_MODES)
  mode: VerificationMode;

  @ValidateIf((o) => o.mode === 'period')
  @IsInt()
  @Min(1)
  @Max(999)
  periodAmount?: number;

  @ValidateIf((o) => o.mode === 'period')
  @IsIn(PERIOD_UNITS)
  periodUnit?: PeriodUnit;

  @ValidateIf((o) => o.mode === 'fixed')
  @IsDateString()
  fixedExpiresAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VERIFIERS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  verifierIds: string[];
}

export class UpdatePageVerificationDto extends PageVerificationPageIdDto {
  @IsOptional()
  @IsIn(VERIFICATION_MODES)
  mode?: VerificationMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  periodAmount?: number;

  @IsOptional()
  @IsIn(PERIOD_UNITS)
  periodUnit?: PeriodUnit;

  @IsOptional()
  @IsDateString()
  fixedExpiresAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VERIFIERS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  verifierIds?: string[];
}

export class ListPageVerificationsDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsUUID()
  verifierId?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
