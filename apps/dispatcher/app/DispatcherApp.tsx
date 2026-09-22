'use client';
import type { ApiError } from '@madart/api-client';
import type { DispatchBoardView, DispatchOrderView, UserProfile } from '@madart/types';
import {
  Button,
  Card,
  ConfirmDialog,
  ConnectionBadge,
  cx,
  formatGel,
  formatTime,
  Input,
  OfflineBanner,
  OrderStatusBadge,
  SessionProvider,
  sourceLabels,
  Spinner,
  ToastProvider,
  useConnectionState,
  useNow,
  useRealtimeEvents,
  useResource,
  useSession,
  useToast,
} from '@madart/ui';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function DispatcherApp() {
  return (
    <SessionProvider config={{ apiUrl: API_URL, storageKey: 'madart.dispatcher.token' }}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </SessionProvider>
  );
}

function Shell() {
  const { api, token, setToken } = useSession();
  const me = useResource(() => api.auth.me(), [token], { enabled: !!token });
  if (!token) return <Login />;
  if (me.error?.isUnauthorized) return <Login error="სესია ვადაგასულია" onReset={() => setToken(null)} />;
  if (!me.data || me.data.kind !== 'user') {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="h-10 w-10" />
      </div>
    );
  }
  return <Board user={me.data.user} />;
}

function Login({ error, onReset }: { error?: string; onReset?: () => void }) {
  const { api, setToken } = useSession();
  const [email, setEmail] = useState('dispatcher@madart.local');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(error ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-6">
      <Card className="w-full max-w-sm space-y-4 p-8">
        <div className="text-2xl font-extrabold">
          <span className="rounded bg-brand px-2 text-brand-ink">MADART</span> Dispatcher
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" autoComplete="username" />
        <Input value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="პაროლი" autoComplete="current-password" />
        <Button
          block
          size="lg"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              onReset?.();
              const res = await api.auth.login(email, password);
              setToken(res.accessToken);
            } catch (e) {
              setErr((e as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          შესვლა
        </Button>
      </Card>
    </div>
  );
}

const REFRESH_EVENTS = ['ORDER_CONFIRMED', 'ORDER_STATUS_CHANGED', 'PRODUCTION_STARTED', 'PRODUCTION_ITEM_READY', 'ORDER_READY_FOR_ASSEMBLY', 'ORDER_READY_FOR_PICKUP', 'ORDER_COMPLETED', 'ORDER_CANCELLED'] as const;

function Board({ user }: { user: UserProfile }) {
  const { api, rt, setToken } = useSession();
  const toast = useToast();
  const connection = useConnectionState(rt);
  const now = useNow(1000, rt);
  const branches = useResource(() => api.branches.list(), []);
  const [branchId, setBranchId] = useState<string | null>(user.branchId);
  const effectiveBranch = branchId ?? branches.data?.[0]?.id ?? null;
  const board = useResource<DispatchBoardView>(() => api.dispatch.board(effectiveBranch ?? undefined), [effectiveBranch], { enabled: !!effectiveBranch, pollMs: 15_000 });
  useRealtimeEvents(rt, () => void board.refresh(), [...REFRESH_EVENTS]);
  const [confirm, setConfirm] = useState<{ order: DispatchOrderView; action: 'ready' | 'handover' | 'force' } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === 'handover') await api.dispatch.handOver(confirm.order.id);
      else await api.dispatch.readyForCustomer(confirm.order.id, confirm.action === 'force');
      toast.success(confirm.order.publicNumber, confirm.action === 'handover' ? 'გადაცემულია' : 'მზადაა მომხმარებლისთვის');
    } catch (e) {
      const err = e as ApiError;
      toast.error(err.isConflict ? 'სტატუსი შეიცვალა' : 'შეცდომა', err.message);
    } finally {
      setBusy(false);
      setConfirm(null);
      void board.refresh();
    }
  };

  const canForce = user.permissions.includes('orders.force_ready');

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <OfflineBanner state={connection} />
      <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-brand px-3 py-1 text-lg font-extrabold text-brand-ink">MADART</span>
          <span className="text-lg font-bold">გამშვები</span>
          {branches.data && branches.data.length > 1 && !user.branchId && (
            <select className="rounded-lg border border-line px-2 py-1 text-sm" value={effectiveBranch ?? ''} onChange={(e) => setBranchId(e.target.value)}>
              {branches.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular text-2xl font-bold">{formatTime(now)}</span>
          <ConnectionBadge state={connection} />
          <span className="text-sm text-ink-muted">{user.displayName}</span>
          <Button variant="ghost" size="sm" onClick={() => setToken(null)}>
            გასვლა
          </Button>
        </div>
      </header>

      {!board.data ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-10 w-10" />
        </div>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-3 gap-4 p-4">
          <Column title="მზადდება" count={board.data.preparing.length} tone="bg-status-in-production">
            {board.data.preparing.map((o) => (
              <OrderCard key={o.id} order={o} now={now} action={canForce ? { label: 'იძულებით მზადაა', variant: 'outline', onClick: () => setConfirm({ order: o, action: 'force' }) } : undefined} />
            ))}
          </Column>
          <Column title="ასაწყობია" count={board.data.readyForAssembly.length} tone="bg-cyan-600">
            {board.data.readyForAssembly.map((o) => (
              <OrderCard key={o.id} order={o} now={now} highlight action={{ label: '✓ მზადაა მომხმარებლისთვის', variant: 'primary', onClick: () => setConfirm({ order: o, action: 'ready' }) }} />
            ))}
          </Column>
          <Column title="მზადაა გასატანად" count={board.data.readyForPickup.length} tone="bg-status-ready">
            {board.data.readyForPickup.map((o) => (
              <OrderCard key={o.id} order={o} now={now} action={{ label: 'გადაცემულია', variant: 'success', onClick: () => setConfirm({ order: o, action: 'handover' }) }} />
            ))}
          </Column>
        </main>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'handover' ? `გადავცე შეკვეთა ${confirm.order.publicNumber}?` : confirm?.action === 'force' ? `იძულებით მზადაა ${confirm?.order.publicNumber}?` : `შეკვეთა ${confirm?.order.publicNumber} მზადაა მომხმარებლისთვის?`}
        message={confirm && (
          <ul className="text-sm text-ink-muted">
            {confirm.order.items.map((i) => (
              <li key={i.id}>
                {i.quantity}× {i.name}
              </li>
            ))}
          </ul>
        )}
        danger={confirm?.action === 'force'}
        loading={busy}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Column({ title, count, tone, children }: { title: string; count: number; tone: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col">
      <div className={cx('mb-3 flex items-center justify-between rounded-xl px-4 py-2 text-white', tone)}>
        <span className="text-lg font-bold">{title}</span>
        <span className="tabular rounded-full bg-white/20 px-3 text-lg font-bold">{count}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">{children}</div>
    </section>
  );
}

function OrderCard({ order, now, action, highlight }: { order: DispatchOrderView; now: Date; action?: { label: string; variant: 'primary' | 'outline' | 'success'; onClick: () => void }; highlight?: boolean }) {
  const waitMin = Math.round((now.getTime() - new Date(order.readyForPickupAt ?? order.targetReadyAt).getTime()) / 60_000);
  return (
    <Card className={cx('space-y-3', highlight && 'ring-2 ring-brand')}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-extrabold tracking-wider">{order.publicNumber}</div>
          <div className="text-xs text-ink-muted">
            {sourceLabels[order.source] ?? order.source} · {order.pickupType === 'SCHEDULED' ? `📅 ${formatTime(order.targetReadyAt)}` : `მიზანი ${formatTime(order.targetReadyAt)}`}
            {order.customerName ? ` · ${order.customerName}` : ''}
          </div>
        </div>
        <div className="text-right">
          <OrderStatusBadge status={order.status} />
          <div className="mt-1 text-xs text-ink-muted">{formatGel(order.total)}</div>
        </div>
      </div>

      <div className="space-y-1">
        {order.groups.map((g) => (
          <div key={g.stationId ?? 'none'} className={cx('rounded-lg px-3 py-2', g.ready ? 'bg-ok-soft' : 'bg-canvas')}>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase text-ink-muted">
              <span>{g.stationCode ?? 'შეფუთვა'}</span>
              <span className={g.ready ? 'text-ok' : ''}>{g.ready ? 'READY ✓' : 'PREPARING'}</span>
            </div>
            {g.items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span>
                  {i.name} ×{i.quantity}
                </span>
                <span className={cx('font-semibold', i.status === 'READY' ? 'text-ok' : i.status === 'IN_PRODUCTION' ? 'text-status-in-production' : 'text-ink-muted')}>
                  {i.status === 'READY' ? '✓' : i.status === 'IN_PRODUCTION' ? '…' : '·'}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-muted">
          {order.groupsReady} / {order.groupsTotal} groups ready
        </span>
        {order.status === 'READY_FOR_PICKUP' && <span className={cx('text-sm font-semibold', waitMin > 10 ? 'text-danger' : 'text-ink-muted')}>ელოდება {waitMin} წთ</span>}
      </div>
      {order.note && <div className="rounded-lg bg-warn-soft px-3 py-1 text-sm text-warn">📝 {order.note}</div>}
      {action && (
        <Button block size="lg" variant={action.variant} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Card>
  );
}
