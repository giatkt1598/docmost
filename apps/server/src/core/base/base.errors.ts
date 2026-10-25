import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { CellValidationError } from './engine/schema.zod';
import { FilterCompileError } from './engine/filter-compiler';
import { SortCompileError } from './engine/sort-compiler';
import { FormulaCompileError } from './engine/formula.engine';

// Turns engine and database errors into HTTP errors with a useful message.
export function toHttpError(e: unknown): Error {
  if (e instanceof HttpException) return e;
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    return new BadRequestException(`${path}${issue?.message ?? 'Invalid input'}`);
  }
  if (
    e instanceof CellValidationError ||
    e instanceof FilterCompileError ||
    e instanceof SortCompileError ||
    e instanceof FormulaCompileError
  ) {
    return new BadRequestException(e.message);
  }
  const err = e as any;
  if (err?.code === '23505') {
    return new ConflictException('A property with this name already exists');
  }
  if (err?.message === 'Invalid cursor') {
    return new BadRequestException('Invalid cursor');
  }
  return e as Error;
}

export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toHttpError(e);
  }
}
