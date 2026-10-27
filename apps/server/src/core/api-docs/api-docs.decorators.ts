import { SetMetadata } from '@nestjs/common';
import { SchemaObject } from './openapi-schema';

export const API_MULTIPART_BODY_KEY = 'apiDocs:multipartBody';
export const API_DESCRIPTION_KEY = 'apiDocs:description';

// Documents a multipart/form-data body for routes that read files from the
// request instead of a DTO. File fields use { type: 'string', format: 'binary' }.
export const ApiMultipartBody = (schema: SchemaObject) =>
  SetMetadata(API_MULTIPART_BODY_KEY, schema);

// A longer explanation shown under the operation summary.
export const ApiDescription = (text: string) =>
  SetMetadata(API_DESCRIPTION_KEY, text);
