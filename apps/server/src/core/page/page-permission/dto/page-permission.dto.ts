import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PagePermissionRole } from '../../../../common/helpers/types/permission';

const ROLES = Object.values(PagePermissionRole);

export class PagePermissionPageDto {
  @IsString()
  pageId: string;
}

export class PagePermissionListDto extends PaginationOptions {
  @IsString()
  pageId: string;
}

export class AddPagePermissionDto extends PagePermissionPageDto {
  @IsIn(ROLES)
  role: PagePermissionRole;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class RemovePagePermissionDto extends PagePermissionPageDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class UpdatePagePermissionRoleDto extends PagePermissionPageDto {
  @IsIn(ROLES)
  role: PagePermissionRole;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}
