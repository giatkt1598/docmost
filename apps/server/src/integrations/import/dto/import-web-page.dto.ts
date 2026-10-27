import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { WebPageMode } from '../utils/web-page-html';

export class ImportWebPageDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsIn(['article', 'full'])
  mode?: WebPageMode;

  // id or slug id of the page to import under; the space root when absent
  @IsOptional()
  @IsString()
  @MaxLength(300)
  parentPageId?: string;
}
