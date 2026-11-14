import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ClsService } from 'nestjs-cls';
import { PAGE_UNLOCK_CLS_KEY, readUnlockCookies } from './page-lock.constants';

// Makes the page unlock cookies of a request available to PageLockService
// wherever the request leads, without threading them through every call.
@Injectable()
export class PageUnlockMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    const tokens = readUnlockCookies(req.headers.cookie);
    if (Object.keys(tokens).length > 0) {
      this.cls.set(PAGE_UNLOCK_CLS_KEY, tokens);
    }
    next();
  }
}
