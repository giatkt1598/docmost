import { HttpException, HttpStatus } from '@nestjs/common';

// Every tool failure in one shape, so a model can tell a mistake it can fix
// from a fault on our side.
export type ToolErrorBody = {
  error: {
    code: 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION' | 'INTERNAL';
    message: string;
  };
};

export function toolError(err: unknown): ToolErrorBody {
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const code =
      status === HttpStatus.NOT_FOUND
        ? 'NOT_FOUND'
        : status === HttpStatus.FORBIDDEN || status === HttpStatus.UNAUTHORIZED
          ? 'FORBIDDEN'
          : 'VALIDATION';
    return { error: { code, message: err.message } };
  }
  return {
    error: {
      code: 'INTERNAL',
      message: `Internal error: ${(err as Error)?.message ?? String(err)}`,
    },
  };
}
