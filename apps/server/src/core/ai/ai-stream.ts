import { HttpException, Logger } from '@nestjs/common';
import { FastifyReply } from 'fastify';

const logger = new Logger('AiStream');

// Streams model output to the browser as plain text chunks. The first chunk
// is awaited before any header is sent, so a provider error still becomes a
// proper HTTP error instead of a broken 200 response.
export async function streamTextResponse(
  res: FastifyReply,
  textStream: AsyncIterable<string>,
  abort: AbortController,
): Promise<void> {
  res.raw.on('close', () => {
    if (!res.raw.writableEnded) abort.abort();
  });

  const iterator = textStream[Symbol.asyncIterator]();
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (err) {
    logger.warn(`AI request failed: ${(err as Error)?.message}`);
    const status = err instanceof HttpException ? err.getStatus() : 502;
    return res.status(status).send({
      message:
        err instanceof HttpException
          ? err.message
          : 'The AI provider did not respond. Check the AI configuration.',
    });
  }

  res.hijack();
  res.raw.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
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
