import { ApiError, type RealtimeClient } from '@madart/api-client';
import type { AnyRealtimeEnvelope, ConnectionState, RealtimeEventType } from '@madart/types';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Ticking clock (server-aligned when a realtime client is given). */
export function useNow(intervalMs = 1000, rt?: RealtimeClient | null): Date {
  const [now, setNow] = useState(() => rt?.now() ?? new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(rt?.now() ?? new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, rt]);
  return now;
}

export function useConnectionState(rt: RealtimeClient | null | undefined): ConnectionState {
  const [state, setState] = useState<ConnectionState>(rt?.state ?? 'OFFLINE');
  useEffect(() => {
    if (!rt) return;
    return rt.onState(setState);
  }, [rt]);
  return state;
}

/** Subscribe to realtime events (all, or a subset of types). */
export function useRealtimeEvents(rt: RealtimeClient | null | undefined, handler: (e: AnyRealtimeEnvelope) => void, types?: RealtimeEventType[]) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = types?.join(',');
  useEffect(() => {
    if (!rt) return;
    return rt.onEvent((e) => {
      if (!types || types.includes(e.type)) ref.current(e);
    });
  }, [rt, key]);
}

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/**
 * Minimal data hook: loads once, exposes refresh(), optional polling as the
 * safety net behind realtime (events are never the only source of state).
 */
export function useResource<T>(loader: () => Promise<T>, deps: unknown[] = [], options: { pollMs?: number; enabled?: boolean } = {}): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const enabled = options.enabled ?? true;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const d = await loaderRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', (e as Error).message));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh, ...deps]);

  useEffect(() => {
    if (!options.pollMs || !enabled) return;
    const id = setInterval(() => void refresh(), options.pollMs);
    return () => clearInterval(id);
  }, [options.pollMs, refresh, enabled]);

  return { data, error, loading, refresh, setData: (u) => setData((prev) => (typeof u === 'function' ? (u as (p: T | null) => T | null)(prev) : u)) };
}

/** Wraps an async action with loading/error state; errors surface via onError (toast). */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, onError?: (e: ApiError) => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      try {
        return await fn(...args);
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', (e as Error).message);
        onError?.(err);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn, onError],
  );
  return { run, busy };
}

/** localStorage-backed state (token, language, selected branch …). */
export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set];
}
