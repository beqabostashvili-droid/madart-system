import { ConflictError, DomainError, InvalidTransitionError, ValidationError } from '@madart/domain';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super('NOT_FOUND', id ? `${entity} ${id} not found` : `${entity} not found`);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message);
  }
}

/** Raised by conflict paths that want to return the current entity state. */
export class StateConflictError extends ConflictError {
  constructor(
    message: string,
    readonly current?: unknown,
  ) {
    super(message);
  }
}

function statusFor(err: DomainError): number {
  if (err instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (err instanceof ForbiddenError) return HttpStatus.FORBIDDEN;
  if (err instanceof UnauthorizedError) return HttpStatus.UNAUTHORIZED;
  if (err instanceof ConflictError || err instanceof InvalidTransitionError) return HttpStatus.CONFLICT;
  if (err instanceof ValidationError) return HttpStatus.BAD_REQUEST;
  return HttpStatus.UNPROCESSABLE_ENTITY;
}

/** Maps domain errors and Nest exceptions to a single ApiError shape. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ method: string; url: string; requestId?: string }>();

    if (exception instanceof DomainError) {
      const status = statusFor(exception);
      const body: Record<string, unknown> = { statusCode: status, code: exception.code, message: exception.message };
      if (exception instanceof StateConflictError && exception.current !== undefined) body.current = exception.current;
      if (exception instanceof InvalidTransitionError) body.details = { from: exception.from, to: exception.to };
      res.status(status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const body =
        typeof response === 'string'
          ? { statusCode: status, code: exception.name.replace(/Exception$/, '').toUpperCase(), message: response }
          : { statusCode: status, code: 'HTTP_ERROR', ...(response as object) };
      res.status(status).json(body);
      return;
    }

    const err = exception as Error;
    this.logger.error(
      JSON.stringify({ msg: 'unhandled error', method: req.method, url: req.url, requestId: req.requestId, error: err?.message }),
      err?.stack,
    );
    res.status(500).json({ statusCode: 500, code: 'INTERNAL', message: 'Internal server error' });
  }
}
