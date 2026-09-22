import { type ApiClient, createApiClient, RealtimeClient } from '@madart/api-client';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export interface SessionConfig {
  apiUrl: string;
  storageKey: string;
  /** Rooms the realtime client should request after connecting. */
  rooms?: string[];
  /** Read the token from the URL (?token=) on first load – used by device apps. */
  tokenFromQuery?: boolean;
}

export interface Session {
  api: ApiClient;
  rt: RealtimeClient | null;
  token: string | null;
  setToken: (t: string | null) => void;
}

const SessionContext = createContext<Session | null>(null);

function readInitialToken(storageKey: string, fromQuery: boolean): { token: string | null; fromQuery: boolean } {
  if (typeof window === 'undefined') return { token: null, fromQuery: false };
  try {
    if (fromQuery) {
      const q = new URLSearchParams(window.location.search).get('token');
      if (q) return { token: q, fromQuery: true };
    }
    return { token: window.localStorage.getItem(storageKey), fromQuery: false };
  } catch {
    return { token: null, fromQuery: false };
  }
}

/**
 * Provides the API client + realtime connection for an app. The token lives
 * in localStorage; device apps receive it once via ?token= from Admin.
 */
export function SessionProvider({ config, children }: { config: SessionConfig; children: ReactNode }) {
  const [initial] = useState(() => readInitialToken(config.storageKey, config.tokenFromQuery ?? false));
  const [token, setTokenState] = useState<string | null>(initial.token);
  const tokenRef = { current: token };

  // A token handed over via ?token= is persisted and stripped from the URL after
  // mount (never during render – routers listen to history changes).
  useEffect(() => {
    if (!initial.fromQuery || !initial.token) return;
    try {
      window.localStorage.setItem(config.storageKey, initial.token);
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  }, [initial, config.storageKey]);

  const setToken = (t: string | null) => {
    setTokenState(t);
    try {
      if (t) window.localStorage.setItem(config.storageKey, t);
      else window.localStorage.removeItem(config.storageKey);
    } catch {
      /* ignore */
    }
  };

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: () => {
          /* apps decide: device apps keep the token and show a pairing screen */
        },
      }),
    [config.apiUrl, token],
  );

  const rt = useMemo(() => (token ? new RealtimeClient({ baseUrl: config.apiUrl, getToken: () => token, rooms: config.rooms }) : null), [config.apiUrl, config.rooms, token]);

  useEffect(() => {
    if (!rt) return;
    rt.connect();
    return () => rt.disconnect();
  }, [rt]);

  return <SessionContext.Provider value={{ api, rt, token, setToken }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
