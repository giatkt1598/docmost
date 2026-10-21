import 'reflect-metadata';
import { getMetadataStorage } from 'class-validator';

// Minimal OpenAPI 3.0 schema objects derived from class-validator metadata,
// so the API reference always matches what the server actually validates.

export type SchemaObject = {
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  pattern?: string;
  description?: string;
  $ref?: string;
};

type Constructor = new (...args: any[]) => unknown;

function typeFromDesign(design: unknown): SchemaObject {
  switch (design) {
    case String:
      return { type: 'string' };
    case Number:
      return { type: 'number' };
    case Boolean:
      return { type: 'boolean' };
    case Date:
      return { type: 'string', format: 'date-time' };
    case Array:
      return { type: 'array', items: {} };
    default:
      return {};
  }
}

// Applies one validation decorator to a property schema.
function apply(
  schema: SchemaObject,
  name: string,
  constraints: any[] = [],
): SchemaObject {
  const [c0, c1] = constraints;
  switch (name) {
    case 'isString':
      return { ...schema, type: 'string' };
    case 'isUuid':
      return { ...schema, type: 'string', format: 'uuid' };
    case 'isEmail':
      return { ...schema, type: 'string', format: 'email' };
    case 'isUrl':
      return { ...schema, type: 'string', format: 'uri' };
    case 'isDateString':
    case 'isIso8601':
      return { ...schema, type: 'string', format: 'date-time' };
    case 'isBoolean':
      return { ...schema, type: 'boolean' };
    case 'isInt':
      return { ...schema, type: 'integer' };
    case 'isNumber':
    case 'isPositive':
      return {
        ...schema,
        type: schema.type === 'integer' ? 'integer' : 'number',
        ...(name === 'isPositive' && { minimum: 1 }),
      };
    case 'isObject':
      return { ...schema, type: 'object' };
    case 'isJSON':
      return { ...schema, type: 'string', description: 'JSON string' };
    case 'isArray':
      return { ...schema, type: 'array', items: schema.items ?? {} };
    case 'isIn':
      return { ...schema, enum: c0 };
    case 'isEnum':
      return { ...schema, enum: Object.values(c0 ?? {}) };
    case 'min':
      return { ...schema, minimum: c0 };
    case 'max':
      return { ...schema, maximum: c0 };
    case 'minLength':
      return { ...schema, minLength: c0 };
    case 'maxLength':
      return { ...schema, maxLength: c0 };
    case 'length':
      return { ...schema, minLength: c0, ...(c1 && { maxLength: c1 }) };
    case 'arrayMaxSize':
      return { ...schema, type: 'array', maxItems: c0 };
    case 'matches':
      return {
        ...schema,
        pattern: c0 instanceof RegExp ? c0.source : String(c0),
      };
    default:
      return schema;
  }
}

export function schemaFromDto(dto: Constructor): SchemaObject {
  const metas = getMetadataStorage().getTargetValidationMetadatas(
    dto,
    '',
    false,
    false,
  );
  const byProperty = new Map<string, typeof metas>();
  for (const meta of metas) {
    const list = byProperty.get(meta.propertyName) ?? [];
    list.push(meta);
    byProperty.set(meta.propertyName, list);
  }

  const properties: Record<string, SchemaObject> = {};
  const required: string[] = [];
  for (const [property, list] of byProperty) {
    let schema = typeFromDesign(
      Reflect.getMetadata('design:type', dto.prototype, property),
    );
    let optional = false;
    for (const meta of list) {
      // @IsOptional; a nameless conditional is @ValidateIf
      if (meta.type === 'conditionalValidation') {
        optional = true;
        continue;
      }
      if (meta.each) {
        const items = apply(schema.items ?? {}, meta.name, meta.constraints);
        schema = { ...schema, type: 'array', items };
      } else {
        schema = apply(schema, meta.name, meta.constraints);
      }
    }
    properties[property] = schema;
    if (!optional) required.push(property);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };
}
