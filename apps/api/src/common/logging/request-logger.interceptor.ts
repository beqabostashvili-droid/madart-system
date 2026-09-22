import { type CallHandler, type ExecutionContext, Injectable, Logger, type NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type Observable, tap } from 'rxjs';
import type { Actor } from '../../auth/actor';

interface RequestLike {
  method: string;
  originalUrl?: string;
  url: string;
  requestId?: string;
  headers: Record<string, string | string[] | undefined>;
  actor?: Actor;
}

/**
 * Structured (JSON) request log: method, path, status, duration, actor,
 * requestId. Searchable fields (order_id, branch_id, …) are logged by services
 * through `logEvent()`.
 */
@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<RequestLike>();
    const res = context.switchToHttp().getResponse<{ statusCode: number; setHeader: (k: string, v: string) => void }>();
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(req, res.statusCode, started),
        error: (err: { status?: number }) => this.log(req, err?.status ?? 500, started),
      }),
    );
  }

  private log(req: RequestLike, status: number, started: number) {
    const actor = req.actor;
    const line = {
      msg: 'request',
      requestId: req.requestId,
      method: req.method,
      path: (req.originalUrl ?? req.url).split('?')[0],
      status,
      durationMs: Date.now() - started,
      actorKind: actor?.kind,
      actorId: actor?.id,
      branchId: actor?.branchId ?? undefined,
      deviceId: actor?.kind === 'device' ? actor.id : undefined,
    };
    if (status >= 500) this.logger.error(JSON.stringify(line));
    else if (status >= 400) this.logger.warn(JSON.stringify(line));
    else this.logger.log(JSON.stringify(line));
  }
}

/** Helper for services: emits one JSON line with searchable ids. */
export function logEvent(logger: Logger, msg: string, fields: Record<string, unknown>) {
  logger.log(JSON.stringify({ msg, ...fields }));
}
