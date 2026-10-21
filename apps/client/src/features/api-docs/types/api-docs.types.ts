export interface ISchema {
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: ISchema;
  properties?: Record<string, ISchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  pattern?: string;
  description?: string;
}

export interface IApiOperation {
  method: string;
  path: string;
  tag: string;
  summary: string;
  operationId: string;
  scope: "read" | "write";
  sessionOnly: boolean;
  pathParams: string[];
  body?: ISchema;
}

export interface IOpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, any>>;
}
