import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'stream';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpService } from './mcp.service';

// Served at /api/mcp-server so it never collides with the enterprise /mcp route.
@UseGuards(McpAuthGuard)
@Controller('mcp-server')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @All()
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const { user, workspace } = (req as any).user;
    const handler = this.mcpService.createHandler({ user, workspace });
    // close only once the (possibly streamed) response is done
    reply.raw.on('close', () => {
      handler.close().catch(() => undefined);
    });

    const response = await handler.fetch(toWebRequest(req), {
      parsedBody: req.method === 'POST' ? req.body : undefined,
    });

    reply.status(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));

    if (!response.body) {
      return reply.send();
    }
    // streams SSE responses through instead of buffering them
    return reply.send(Readable.fromWeb(response.body as any));
  }
}

function toWebRequest(req: FastifyRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  const url = `${req.protocol}://${req.host}${req.url}`;
  // the body is already parsed by fastify and handed over as parsedBody
  return new Request(url, { method: req.method, headers });
}
