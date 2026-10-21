import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  AI_ASSIST_ACTIONS,
  AI_ASSIST_TONES,
  AiAssistAction,
} from '../ai-assist.prompts';

export class AiAssistGenerateDto {
  @IsIn(AI_ASSIST_ACTIONS)
  action: AiAssistAction;

  // the selected text (or, for "continue", the text before the cursor)
  @IsString()
  @MaxLength(20000)
  text: string;

  // the instruction for "custom"
  @ValidateIf((o) => o.action === 'custom')
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string;

  @IsOptional()
  @IsIn(AI_ASSIST_TONES)
  tone?: string;
}
