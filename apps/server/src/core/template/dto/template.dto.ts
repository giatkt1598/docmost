import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class TemplateIdDto {
  @IsUUID()
  templateId: string;
}

export class ListTemplatesDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  // null or omitted = workspace-wide (Global) template
  @IsOptional()
  @ValidateIf((o) => o.spaceId !== null)
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, any>;

  // Save as template: copy title, icon and content from this page
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourcePageId?: string;
}

export class UpdateTemplateDto extends TemplateIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @ValidateIf((o) => o.spaceId !== null)
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, any>;
}

export class UseTemplateDto extends TemplateIdDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;
}
