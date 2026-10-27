import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export class CreateMcpTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

// cursor-paginated list of every token of the workspace (admins only)
export class ListMcpTokensDto extends PaginationOptions {}

export class McpTokenIdDto {
  @IsUUID()
  tokenId: string;
}
