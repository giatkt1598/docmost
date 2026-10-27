import { IsIn, IsOptional, IsUrl, IsUUID } from 'class-validator';
import { WebPageMode } from '../utils/web-page-html';

export class ImportWebPageDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsIn(['article', 'full'])
  mode?: WebPageMode;
}
