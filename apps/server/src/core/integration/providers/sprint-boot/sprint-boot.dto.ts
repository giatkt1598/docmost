import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SprintBootStartLinkDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(512)
  sprintBootUrl: string;
}

export class SprintBootLinkPreviewDto extends SprintBootStartLinkDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  state: string;
}

export class SprintBootAuthorizeDto extends SprintBootLinkPreviewDto {
  // The Sprint Boot space to link, with the Docmost space below or a new one.
  @IsOptional()
  @IsString()
  @MaxLength(10)
  spaceKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  docmostSpaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  newSpaceName?: string;
}

export class SprintBootLinkStateDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  state: string;
}

export class SprintBootLinkCompleteDto extends SprintBootLinkStateDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(512)
  sprintBootUrl: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(256)
  bridgeSecret: string;
}

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
