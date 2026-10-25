import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class BasePageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class CreateBaseDto {
  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsIn(['kanban'])
  template?: 'kanban';
}

export class ConvertBaseDto extends BasePageDto {
  @IsOptional()
  @IsIn(['kanban'])
  template?: 'kanban';
}

export class UpdateBaseDto extends BasePageDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class ExportBaseCsvDto extends BasePageDto {
  @IsOptional()
  @IsObject()
  filter?: any;
}

export class ListBasesDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ExpandPagesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  pageIds: string[];
}

// ---- properties ----------------------------------------------------------

export class CreatePropertyDto extends BasePageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsObject()
  typeOptions?: any;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class UpdatePropertyDto extends BasePageDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  typeOptions?: any;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class DeletePropertyDto extends BasePageDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class ReorderPropertyDto extends DeletePropertyDto {
  @IsString()
  @IsNotEmpty()
  position: string;
}

// ---- rows ----------------------------------------------------------------

export class CreateRowDto extends BasePageDto {
  @IsOptional()
  @IsObject()
  cells?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  afterRowId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class RowInfoDto extends BasePageDto {
  @IsUUID()
  rowId: string;
}

export class UpdateRowDto extends RowInfoDto {
  @IsOptional()
  @IsObject()
  cells?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class DeleteRowDto extends RowInfoDto {
  @IsOptional()
  @IsString()
  requestId?: string;
}

export class DeleteRowsDto extends BasePageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  rowIds: string[];

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class RestoreRowsDto extends DeleteRowsDto {}

export class ReorderRowDto extends RowInfoDto {
  @IsString()
  @IsNotEmpty()
  position: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class ListRowsDto extends BasePageDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsObject()
  filter?: any;

  @IsOptional()
  @IsArray()
  sorts?: any[];

  // quick search over the row values, combined with the filter
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class RowPageDto extends BasePageDto {
  @IsUUID()
  rowId: string;
}

// ---- views ---------------------------------------------------------------

export class CreateViewDto extends BasePageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  config?: any;
}

export class UpdateViewDto extends BasePageDto {
  @IsUUID()
  viewId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  config?: any;

  @IsOptional()
  @IsString()
  position?: string;
}

export class DeleteViewDto extends BasePageDto {
  @IsUUID()
  viewId: string;
}

// ---- public (shares and public spaces) -----------------------------------

export class PublicBaseDto extends BasePageDto {
  @IsOptional()
  @IsString()
  shareId?: string;

  @IsOptional()
  @IsString()
  spaceSlug?: string;

  // The shared page that embeds the base, when the base is not shared itself.
  @IsOptional()
  @IsString()
  hostPageId?: string;
}

export class PublicListRowsDto extends PublicBaseDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsObject()
  filter?: any;

  @IsOptional()
  @IsArray()
  sorts?: any[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
