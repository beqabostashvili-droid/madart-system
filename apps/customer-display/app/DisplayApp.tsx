'use client';
import type { DeviceProfile, DisplayBoardView, DisplayEntry } from '@madart/types';
import { Button, Card, cx, formatTime, Input, SessionProvider, Spinner, useConnectionState, useNow, useRealtimeEvents, useResource, useSession, useStoredState } from '@madart/ui';
import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function DisplayApp() {
  return (
    <SessionProvider config={{ apiUrl: API_URL, storageKey: 'madart.display.token', tokenFromQuery: true }}>
      <Screen />
    </SessionProvider>
  );
}

function Screen() {
  const { api, rt, token, setToken } = useSession();
  const connection = useConnectionState(rt);
  const now = useNow(1000, rt);
  const [sound, setSound] = useStoredState('madart.display.sound', true);
  const device = useResource<DeviceProfile>(() => api.auth.device(), [token], { enabled: !!token });
  const board = useResource<DisplayBoardView>(() => api.display.board(device.data!.branchId), [device.data?.branchId], { enabled: !!device.data, pollMs: 20_000 });
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const prevReady = useRef<Set<string>>(new Set());

  // Realtime snapshot pushed by the server (spec §10, no refresh needed).
  useRealtimeEvents(rt, (e) => {
    if (e.type === 'DISPLAY_BOARD') board.setData(e.payload);
  }, ['DISPLAY_BOARD']);

  // Detect newly ready numbers → highlight + gentle chime.
  useEffect(() => {
    if (!board.data) return;
    const current = new Set(board.data.ready.map((r) => r.publicNumber));
    const fresh = [...current].filter((n) => !prevReady.current.has(n));
    if (fresh.length && prevReady.current.size + fresh.length > 0) {
      setFlash(new Set(fresh));
      if (sound && prevReady.current.size > 0) chime();
      const t = setTimeout(() => setFlash(new Set()), 6000);
      prevReady.current = current;
      return () => clearTimeout(t);
    }
    prevReady.current = current;
  }, [board.data, sound]);

  if (!token) return <Pairing onToken={setToken} />;
  if (device.error?.isUnauthorized) return <Pairing onToken={setToken} error={device.error.message} />;
  if (!device.data || !board.data) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="h-12 w-12 text-brand" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col text-white">
      <header className="flex items-center justify-between px-8 py-4">
        <span className="rounded-xl bg-brand px-4 py-1 text-2xl font-extrabold tracking-wide text-brand-ink lg:text-3xl">MADART</span>
        <div className="flex items-center gap-4">
          <button onClick={() => setSound(!sound)} className="text-2xl opacity-60" aria-label="sound">
            {sound ? '🔔' : '🔕'}
          </button>
          <span className={cx('h-3 w-3 rounded-full', connection === 'ONLINE' ? 'bg-status-ready' : connection === 'RECONNECTING' ? 'bg-warn animate-pulse' : 'bg-danger')} />
          <span className="tabular text-3xl font-bold lg:text-4xl">{formatTime(now)}</span>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-2 gap-6 px-8 pb-8">
        <Section title="მზადდება" subtitle="PREPARING" tone="border-white/20" numbers={board.data.preparing} numberClass="bg-white/10 text-white" />
        <Section title="მზადაა" subtitle="READY" tone="border-status-ready" numbers={board.data.ready} numberClass="bg-status-ready text-white" flash={flash} big />
      </main>
    </div>
  );
}

function Section({ title, subtitle, tone, numbers, numberClass, flash, big }: { title: string; subtitle: string; tone: string; numbers: DisplayEntry[]; numberClass: string; flash?: Set<string>; big?: boolean }) {
  return (
    <section className={cx('flex min-h-0 flex-col rounded-3xl border-4 p-6', tone)}>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-3xl font-extrabold lg:text-5xl">{title}</h2>
        <span className="text-sm font-semibold uppercase tracking-widest opacity-50 lg:text-xl">{subtitle}</span>
      </div>
      <div className={cx('grid content-start gap-4 overflow-hidden', big ? 'grid-cols-2' : 'grid-cols-3')}>
        {numbers.map((n) => (
          <div
            key={n.orderId}
            className={cx(
              'flex items-center justify-center rounded-2xl font-extrabold tracking-wider tabular animate-pop',
              big ? 'h-20 text-3xl lg:h-28 lg:text-6xl 2xl:h-32 2xl:text-7xl' : 'h-16 text-2xl lg:h-24 lg:text-4xl 2xl:text-5xl',
              numberClass,
              flash?.has(n.publicNumber) && 'ring-8 ring-brand scale-105 transition-transform',
            )}
          >
            {n.publicNumber}
          </div>
        ))}
        {numbers.length === 0 && <div className="col-span-full py-16 text-center text-2xl opacity-30">—</div>}
      </div>
    </section>
  );
}

function chime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [880, 1174.66];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.45);
    });
  } catch {
    /* autoplay blocked – ignore */
  }
}

function Pairing({ onToken, error }: { onToken: (t: string) => void; error?: string }) {
  const [v, setV] = useState('');
  return (
    <div className="flex h-dvh items-center justify-center p-8">
      <Card className="w-full max-w-lg space-y-4 p-8">
        <div className="text-2xl font-bold">Customer Display არ არის დარეგისტრირებული</div>
        <p className="text-ink-muted">ჩასვით მოწყობილობის ტოკენი Admin → Customer Displays-იდან, ან გახსენით ბმული ?token=…</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="device token" />
        <Button block size="lg" disabled={!v.trim()} onClick={() => onToken(v.trim())}>
          დაკავშირება
        </Button>
      </Card>
    </div>
  );
}
