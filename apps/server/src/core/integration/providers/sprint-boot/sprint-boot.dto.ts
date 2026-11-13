import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SprintBootSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  spaceKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SprintBootCreateTicketDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  spaceKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;
}
