import {
  IsBoolean,
  IsIn,
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

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;
}

export class TestAiProviderDto extends AiProviderConnectionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  model: string;
}
