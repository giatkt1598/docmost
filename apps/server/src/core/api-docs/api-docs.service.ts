import { Injectable, RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { OAUTH_SCOPE_KEY } from '../../common/decorators/oauth-scope.decorator';
import { REQUIRE_SESSION_AUTH_KEY } from '../../common/decorators/require-session-auth.decorator';
import { DomainService } from '../../integrations/environment/domain.service';
import { schemaFromDto, SchemaObject } from './openapi-schema';

export type ApiOperation = {
  method: string;
  path: string;
  tag: string;
  summary: string;
  operationId: string;
  scope: 'read' | 'write';
  // the route refuses API keys (interactive session only)
  sessionOnly: boolean;
  pathParams: string[];
  body?: SchemaObject;
};

const METHODS: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

function joinPath(...parts: string[]) {
  const path = parts
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return `/${path}`;
}

// "PageVerificationController" -> "Page verification"
function tagFor(controllerName: string) {
  return humanize(controllerName.replace(/Controller$/, ''));
}

// pagination fields only the admin settings pages use
const INTERNAL_FIELDS = new Set(['adminView']);

// "getSpaceInfo" -> "Get space info"
function humanize(name: string) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// The public API is every route marked with @OAuthScope: the same set that
// OAuth clients and API keys are meant to call.
@Injectable()
export class ApiDocsService {
  private spec: Record<string, unknown> | null = null;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly domainService: DomainService,
  ) {}

  operations(): ApiOperation[] {
    const operations: ApiOperation[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const controller = wrapper.metatype as any;
      if (!controller?.prototype) continue;
      const basePath = [].concat(
        Reflect.getMetadata(PATH_METADATA, controller) ?? '',
      )[0];

      for (const name of this.scanner.getAllMethodNames(controller.prototype)) {
        const handler = controller.prototype[name];
        const scope = this.reflector.get(OAUTH_SCOPE_KEY, handler);
        if (!scope) continue;

        const method =
          METHODS[
            Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod
          ];
        if (!method) continue;
        const routePath = [].concat(
          Reflect.getMetadata(PATH_METADATA, handler) ?? '',
        )[0];
        const path = joinPath('api', basePath, routePath);

        operations.push({
          method,
          path,
          tag: tagFor(controller.name),
          summary: humanize(name),
          operationId: `${controller.name.replace(/Controller$/, '')}_${name}`,
          scope,
          sessionOnly: !!this.reflector.getAllAndOverride(
            REQUIRE_SESSION_AUTH_KEY,
            [handler, controller],
          ),
          pathParams: [...path.matchAll(/:([a-zA-Z0-9_]+)/g)].map((m) => m[1]),
          body: this.bodySchema(controller, name),
        });
      }
    }
    return operations.sort(
      (a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path),
    );
  }

  openApi(): Record<string, unknown> {
    if (this.spec) return this.spec;

    const paths: Record<string, Record<string, unknown>> = {};
    for (const op of this.operations()) {
      const openApiPath = op.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
      paths[openApiPath] ??= {};
      paths[openApiPath][op.method] = {
        tags: [op.tag],
        summary: op.summary,
        operationId: op.operationId,
        ...(op.sessionOnly && {
          description:
            'Requires an interactive session; API keys are refused (403).',
        }),
        'x-docmost-scope': op.scope,
        'x-docmost-session-only': op.sessionOnly,
        parameters: op.pathParams.map((name) => ({
          name,
          in: 'path',
          required: true,
          schema: { type: 'string' },
        })),
        ...(op.body && {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: op.body } },
          },
        }),
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Envelope' },
              },
            },
          },
          '400': { description: 'Invalid request body' },
          '401': { description: 'Missing, invalid or revoked API key' },
          '403': { description: 'Not allowed for this user' },
          '404': { description: 'Not found' },
        },
      };
    }

    this.spec = {
      openapi: '3.0.3',
      info: {
        title: 'Docmost API',
        version: '1.0',
        description:
          'RPC-style API: almost every endpoint is a POST with a JSON body. ' +
          'Authenticate with an API key as a Bearer token. Responses are ' +
          'wrapped as { data, success, status }.',
      },
      servers: [{ url: this.domainService.getUrl() }],
      security: [{ apiKey: [] }],
      components: {
        securitySchemes: {
          apiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        schemas: {
          Envelope: {
            type: 'object',
            properties: {
              data: {},
              success: { type: 'boolean' },
              status: { type: 'integer' },
            },
          },
        },
      },
      paths,
    };
    return this.spec;
  }

  // Request body: handlers may take several @Body() DTOs (e.g. a page id and
  // pagination) or single fields (@Body('pageId')); merge them all.
  private bodySchema(controller: any, name: string): SchemaObject | undefined {
    const args: Record<string, { index: number; data?: unknown }> =
      Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {};
    const bodies = Object.entries(args)
      .filter(([key]) => key.startsWith(`${RouteParamtypes.BODY}:`))
      .map(([, arg]) => arg);
    if (bodies.length === 0) return undefined;

    const types =
      Reflect.getMetadata('design:paramtypes', controller.prototype, name) ??
      [];
    const merged: SchemaObject = { type: 'object', properties: {} };
    const required = new Set<string>();
    for (const { index, data } of bodies) {
      const type = types[index];
      if (typeof data === 'string') {
        merged.properties[data] =
          type === Number
            ? { type: 'number' }
            : type === Boolean
              ? { type: 'boolean' }
              : { type: 'string' };
        required.add(data);
        continue;
      }
      if (typeof type !== 'function' || type === Object) continue;
      const schema = schemaFromDto(type);
      for (const [field, fieldSchema] of Object.entries(schema.properties)) {
        if (!INTERNAL_FIELDS.has(field)) merged.properties[field] = fieldSchema;
      }
      schema.required?.forEach((r) => required.add(r));
    }
    if (required.size > 0) merged.required = [...required];
    return merged;
  }
}
