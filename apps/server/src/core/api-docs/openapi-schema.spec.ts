import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { schemaFromDto } from './openapi-schema';

class BaseDto {
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;
}

class SampleDto extends BaseDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsIn(['json', 'markdown'])
  @ValidateIf((o) => !!o.title)
  format: string;

  @IsOptional()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(10)
  userIds?: string[];

  @IsBoolean()
  flag: boolean;

  @Matches(/^[a-z]+$/)
  slug: string;
}

describe('schemaFromDto', () => {
  const schema = schemaFromDto(SampleDto);

  it('maps validators to types, formats and limits', () => {
    expect(schema.properties.pageId).toEqual({
      type: 'string',
      format: 'uuid',
    });
    expect(schema.properties.title).toEqual({
      type: 'string',
      maxLength: 50,
    });
    expect(schema.properties.flag).toEqual({ type: 'boolean' });
    expect(schema.properties.slug).toMatchObject({ pattern: '^[a-z]+$' });
    expect(schema.properties.format.enum).toEqual(['json', 'markdown']);
  });

  it('describes arrays validated per item', () => {
    expect(schema.properties.userIds).toEqual({
      type: 'array',
      maxItems: 10,
      items: { type: 'string', format: 'uuid' },
    });
  });

  it('includes inherited fields', () => {
    expect(schema.properties.limit).toEqual({
      type: 'number',
      minimum: 1,
      maximum: 100,
    });
  });

  it('marks optional and conditional fields as not required', () => {
    expect(schema.required.sort()).toEqual(['flag', 'pageId', 'slug']);
  });
});
