import { HttpException, Logger } from '@nestjs/common';
import { FastifyReply } from 'fastify';

const logger = new Logger('AiStream');

function errorResponse(res: FastifyReply, err: unknown) {
  logger.warn(`AI request failed: ${(err as Error)?.message}`);
  const status = err instanceof HttpException ? err.getStatus() : 502;
  return res.status(status).send({
    message:
      err instanceof HttpException
        ? err.message
        : 'The AI provider did not respond. Check the AI configuration.',
  });
}

// Streams chunks to the browser. The first chunk is awaited before any
// header is sent, so a provider error still becomes a proper HTTP error
// instead of a broken 200 response.
async function streamChunks(
  res: FastifyReply,
  chunks: AsyncIterable<string>,
  abort: AbortController,
  contentType: string,
): Promise<void> {
  res.raw.on('close', () => {
    if (!res.raw.writableEnded) abort.abort();
  });

  const iterator = chunks[Symbol.asyncIterator]();
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (err) {
    return errorResponse(res, err);
  }

  res.hijack();
  res.raw.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  try {
    for (
      let chunk = first;
      !chunk.done && !abort.signal.aborted;
      chunk = await iterator.next()
    ) {
      res.raw.write(chunk.value);
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      logger.warn(`AI stream interrupted: ${(err as Error)?.message}`);
    }
  } finally {
    res.raw.end();
  }
}

// Model output as plain text chunks.
export function streamTextResponse(
  res: FastifyReply,
  textStream: AsyncIterable<string>,
  abort: AbortController,
): Promise<void> {
  return streamChunks(res, textStream, abort, 'text/plain; charset=utf-8');
}

// Events as newline-delimited JSON, one object per line.
export function streamNdjsonResponse(
  res: FastifyReply,
  events: AsyncIterable<object>,
  abort: AbortController,
): Promise<void> {
  async function* lines() {
    for await (const event of events) yield `${JSON.stringify(event)}\n`;
  }
  return streamChunks(
    res,
    lines(),
    abort,
    'application/x-ndjson; charset=utf-8',
  );
}
