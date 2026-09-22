import type { ApiError as ApiErrorBody } from '@madart/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    /** Current server-side state returned on 409 conflicts. */
    readonly current?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isConflict() {
    return this.status === 409;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export interface HttpOptions {
  baseUrl: string;
  getToken: () => string | null | undefined;
  /** Called on 401 so the app can drop its session. */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  /** Default request timeout (ms). */
  timeoutMs?: number;
}

export interface RequestOptions {
  retries?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Small fetch wrapper: JSON in/out, bearer token, timeouts, safe retries for
 * idempotent GETs, uniform ApiError. POSTs are never retried automatically –
 * callers pass idempotency keys and retry explicitly (spec §32).
 */
export class Http {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpOptions) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  get baseUrl() {
    return this.options.baseUrl.replace(/\/$/, '');
  }

  async request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    const retries = opts.retries ?? (RETRYABLE_METHODS.has(method) ? 2 : 0);
    let attempt = 0;
    for (;;) {
      try {
        return await this.once<T>(method, path, body, opts);
      } catch (err) {
        const retryable = err instanceof ApiError && (err.isNetwork || err.status >= 502);
        if (!retryable || attempt >= retries) throw err;
        attempt++;
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      }
    }
  }

  private async once<T>(method: string, path: string, body: unknown, opts: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.options.timeoutMs ?? 15_000);
    opts.signal?.addEventListener('abort', () => controller.abort());
    const token = this.options.getToken();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApiError(0, 'NETWORK', (err as Error).name === 'AbortError' ? 'Request timed out' : 'Network error');
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const e = (json ?? {}) as Partial<ApiErrorBody> & { current?: unknown };
      if (res.status === 401) this.options.onUnauthorized?.();
      throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? res.statusText, e.details, e.current);
    }
    return json as T;
  }

  get<T>(path: string, opts?: RequestOptions) {
    return this.request<T>('GET', path, undefined, opts);
  }
  post<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>('POST', path, body ?? {}, opts);
  }
  put<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>('PUT', path, body ?? {}, opts);
  }
  patch<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request<T>('PATCH', path, body ?? {}, opts);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function qs<T extends object>(params: T): string {
  const entries = Object.entries(params as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

/** Idempotency key generator (works in browsers, Node and Electron). */
export function newIdempotencyKey(prefix = 'req'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${rnd}`;
}
