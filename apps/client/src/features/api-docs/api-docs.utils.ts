import {
  IApiOperation,
  IOpenApiSpec,
  ISchema,
} from "@/features/api-docs/types/api-docs.types";

export function operationsFromSpec(spec: IOpenApiSpec): IApiOperation[] {
  const operations: IApiOperation[] = [];
  for (const [openApiPath, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const content = op.requestBody?.content ?? {};
      const multipartBody = content["multipart/form-data"]?.schema;
      operations.push({
        method,
        path: openApiPath,
        tag: op.tags?.[0] ?? "General",
        summary: op.summary,
        operationId: op.operationId,
        scope: op["x-docmost-scope"],
        sessionOnly: !!op["x-docmost-session-only"],
        pathParams: (op.parameters ?? []).map((p: any) => p.name),
        description: op.description,
        body: content["application/json"]?.schema ?? multipartBody,
        multipart: !!multipartBody,
      });
    }
  }
  return operations;
}

// Placeholder value for a field, used in examples and "Try it".
function exampleValue(name: string, schema: ISchema): unknown {
  if (schema.enum?.length) return schema.enum[0];
  switch (schema.type) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return schema.minimum ?? 1;
    case "array":
      return [];
    case "object":
      return {};
    default:
      if (schema.format === "uuid") return `<${name}>`;
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.description === "JSON string") return "{}";
      return `<${name}>`;
  }
}

// Required fields only; the field table lists the optional ones.
export function exampleBody(schema?: ISchema): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const name of schema?.required ?? []) {
    body[name] = exampleValue(name, schema.properties?.[name] ?? {});
  }
  return body;
}

export function isFileField(schema?: ISchema): boolean {
  return schema?.type === "string" && schema.format === "binary";
}

// Multipart fields with the files last: the server only sees the fields that
// arrive before the file part.
export function multipartFields(schema?: ISchema): [string, ISchema][] {
  const fields = Object.entries(schema?.properties ?? {});
  return [
    ...fields.filter(([, s]) => !isFileField(s)),
    ...fields.filter(([, s]) => isFileField(s)),
  ];
}

export function describeType(schema: ISchema): string {
  if (isFileField(schema)) return "file";
  if (schema.type === "array") {
    const item = schema.items ? describeType(schema.items) : "any";
    return `${item}[]`;
  }
  const base = schema.type ?? "any";
  return schema.format ? `${base} (${schema.format})` : base;
}

export function describeConstraints(schema: ISchema): string[] {
  const out: string[] = [];
  if (schema.enum?.length) out.push(schema.enum.map(String).join(" | "));
  if (schema.minimum !== undefined) out.push(`≥ ${schema.minimum}`);
  if (schema.maximum !== undefined) out.push(`≤ ${schema.maximum}`);
  if (schema.minLength !== undefined) out.push(`min ${schema.minLength} chars`);
  if (schema.maxLength !== undefined) out.push(`max ${schema.maxLength} chars`);
  if (schema.maxItems !== undefined) out.push(`max ${schema.maxItems} items`);
  if (schema.pattern) out.push(`/${schema.pattern}/`);
  if (schema.description) out.push(schema.description);
  return out;
}

export function curlExample(
  baseUrl: string,
  op: IApiOperation,
  body: Record<string, unknown> | null,
): string {
  const lines = [
    `curl -X ${op.method.toUpperCase()} "${baseUrl}${op.path}"`,
    `  -H "Authorization: Bearer $DOCMOST_API_KEY"`,
  ];
  if (op.multipart) {
    const required = new Set(op.body?.required ?? []);
    for (const [name, schema] of multipartFields(op.body)) {
      if (!required.has(name)) continue;
      const value = isFileField(schema)
        ? `@path/to/${name}`
        : String(exampleValue(name, schema));
      lines.push(`  -F "${name}=${value}"`);
    }
    return lines.join(" \\\n");
  }
  if (body) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${JSON.stringify(body)}'`);
  }
  return lines.join(" \\\n");
}
