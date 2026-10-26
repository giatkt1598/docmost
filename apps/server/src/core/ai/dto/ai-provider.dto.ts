import {
  IsBoolean,
  IsIn,
  IsInt,
  Max,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { AI_DRIVERS, AiDriver } from '../ai-provider.service';

const trim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;

// Connection settings; an empty apiKey means "use the saved one".
export class AiProviderConnectionDto {
  @IsIn(AI_DRIVERS)
  driver: AiDriver;

  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;
}

export class SaveAiProviderDto extends AiProviderConnectionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  completionModel: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  chatModel?: string;

  // model that turns pages into vectors for semantic search
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  embeddingModel?: string;

  // shortened size for models that support it; empty keeps the native size
  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(4000)
  embeddingDimensions?: number;

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;
}

export class TestEmbeddingDto extends AiProviderConnectionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  model: string;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(4000)
  dimensions?: number;
}

export class TestAiProviderDto extends AiProviderConnectionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  model: string;
}
