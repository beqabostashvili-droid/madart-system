import { type ApiError, newIdempotencyKey } from '@madart/api-client';
import { normalizeOrderNumber } from '@madart/domain';
import type { CatalogProductView, CatalogView, OrderSummaryView, OrderView, PaymentView, UserProfile } from '@madart/types';
import {
  Button,
  Card,
  ConnectionBadge,
  cx,
  formatGel,
  formatTime,
  Input,
  Modal,
  NumberPad,
  OfflineBanner,
  OrderStatusBadge,
  QuantityStepper,
  sourceLabels,
  Spinner,
  useConnectionState,
  useRealtimeEvents,
  useReceipts,
  useResource,
  useSession,
  useToast,
} from '@madart/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cashDrawer, receiptFor } from './receipt';

type Tab = 'awaiting' | 'new';

export function App() {
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
  return <Pos user={me.data.user} />;
}

function Login({ error, onReset }: { error?: string; onReset?: () => void }) {
  const { api, setToken } = useSession();
  const [email, setEmail] = useState('cashier@madart.local');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(error ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-6">
      <Card className="w-full max-w-sm space-y-4 p-8">
        <div className="text-2xl font-extrabold">
          <span className="rounded bg-brand px-2 text-brand-ink">MADART</span> POS
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr('');
            try {
              onReset?.();
              const r = await api.auth.login(email, password);
              setToken(r.accessToken);
            } catch (er) {
              setErr((er as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <Input value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="პაროლი" />
          <Button block size="lg" type="submit" loading={busy}>
            შესვლა
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Pos({ user }: { user: UserProfile }) {
  const { api, rt, setToken } = useSession();
  const connection = useConnectionState(rt);
  const branches = useResource(() => api.branches.list(), []);
  const branchId = user.branchId ?? branches.data?.[0]?.id ?? null;
  const branchName = branches.data?.find((b) => b.id === branchId)?.name ?? '';
  const [tab, setTab] = useState<Tab>('awaiting');
  const awaiting = useResource(() => api.orders.list({ branchId: branchId ?? undefined, awaitingCash: true, limit: 100 }), [branchId], { enabled: !!branchId, pollMs: 15_000 });
  useRealtimeEvents(rt, () => void awaiting.refresh(), ['ORDER_CREATED', 'PAYMENT_COMPLETED', 'ORDER_CANCELLED', 'ORDER_STATUS_CHANGED']);

  // keyboard shortcuts (spec §46)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setTab('new');
      }
      if (e.key === 'F3') {
        e.preventDefault();
        setTab('awaiting');
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  if (!branchId) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <OfflineBanner state={connection} />
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-brand px-3 py-1 font-extrabold text-brand-ink">MADART</span>
          <span className="font-bold">POS</span>
          <span className="text-sm text-ink-muted">· {branchName}</span>
        </div>
        <div className="flex gap-1">
          <TabButton active={tab === 'awaiting'} onClick={() => setTab('awaiting')}>
            გადახდის მოლოდინში <kbd className="ml-1 rounded bg-black/10 px-1 text-xs">F3</kbd>
            {awaiting.data && awaiting.data.total > 0 && <span className="ml-2 rounded-full bg-warn px-2 text-xs text-white">{awaiting.data.total}</span>}
          </TabButton>
          <TabButton active={tab === 'new'} onClick={() => setTab('new')}>
            ახალი შეკვეთა <kbd className="ml-1 rounded bg-black/10 px-1 text-xs">F2</kbd>
          </TabButton>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <ConnectionBadge state={connection} compact />
          <span>{user.displayName}</span>
          <Button variant="ghost" size="sm" onClick={() => setToken(null)}>
            გასვლა
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        {tab === 'awaiting' ? (
          <AwaitingCash branchId={branchId} branchName={branchName} orders={awaiting.data?.items ?? []} refresh={awaiting.refresh} canConfirm={user.permissions.includes('payments.confirm_cash')} />
        ) : (
          <NewOrder branchId={branchId} branchName={branchName} onDone={() => void awaiting.refresh()} />
        )}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx('flex items-center rounded-xl px-4 py-2 text-sm font-semibold', active ? 'bg-ink text-white' : 'bg-canvas text-ink-muted hover:bg-black/5')}>
      {children}
    </button>
  );
}

// ───────────────────────────── B. kiosk cash orders ─────────────────────

function parseScan(input: string): string {
  // QR payload "MADART:A154:<uuid>" or a plain number
  const m = /^MADART:([A-Z0-9]+):/i.exec(input.trim());
  return normalizeOrderNumber(m ? m[1]! : input);
}

function AwaitingCash({ branchId, branchName, orders, refresh, canConfirm }: { branchId: string; branchName: string; orders: OrderSummaryView[]; refresh: () => Promise<void>; canConfirm: boolean }) {
  const { api } = useSession();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OrderView | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(
    async (idOrNumber: { id?: string; number?: string }) => {
      try {
        const o = idOrNumber.id ? await api.orders.get(idOrNumber.id) : await api.orders.byNumber(branchId, idOrNumber.number!);
        setSelected(o);
      } catch (e) {
        toast.error('შეკვეთა ვერ მოიძებნა', (e as ApiError).message);
      }
    },
    [api, branchId, toast],
  );

  useEffect(() => inputRef.current?.focus(), []);
  const filtered = orders.filter((o) => !search || o.publicNumber.includes(normalizeOrderNumber(search)) || (o.customerName ?? '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="grid h-full grid-cols-[1fr_420px]">
      <div className="flex min-h-0 flex-col p-4">
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (search.trim()) void open({ number: parseScan(search) });
          }}
        >
          <Input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="შეკვეთის ნომერი / QR სკანი (მაგ. A154)" className="text-lg" autoFocus />
          <Button type="submit">ძებნა</Button>
        </form>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto xl:grid-cols-3">
          {filtered.length === 0 && <div className="col-span-full py-16 text-center text-ink-muted">ნაღდით გადასახდელი შეკვეთები არ არის</div>}
          {filtered.map((o) => (
            <button key={o.id} onClick={() => void open({ id: o.id })} className={cx('card p-4 text-left transition active:scale-[0.98]', selected?.id === o.id && 'ring-2 ring-brand')}>
              <div className="flex items-start justify-between">
                <span className="text-3xl font-extrabold tracking-wider">{o.publicNumber}</span>
                <span className="text-xs text-ink-muted">{sourceLabels[o.source]}</span>
              </div>
              <div className="mt-1 text-sm text-ink-muted">
                {o.itemCount} ერთ. · {formatTime(o.createdAt)} {o.customerName ? `· ${o.customerName}` : ''}
              </div>
              <div className="mt-2 text-xl font-bold tabular">{formatGel(o.total)}</div>
            </button>
          ))}
        </div>
      </div>
      <aside className="border-l border-line bg-surface p-4">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-center text-ink-muted">აირჩიეთ შეკვეთა ან დაასკანერეთ QR</div>
        ) : (
          <OrderPanel
            order={selected}
            branchName={branchName}
            canConfirm={canConfirm}
            onClose={() => setSelected(null)}
            onPaid={() => {
              setSelected(null);
              setSearch('');
              void refresh();
              inputRef.current?.focus();
            }}
          />
        )}
      </aside>
    </div>
  );
}

function OrderPanel({ order, branchName, canConfirm, onClose, onPaid }: { order: OrderView; branchName: string; canConfirm: boolean; onClose: () => void; onPaid: () => void }) {
  const { api } = useSession();
  const toast = useToast();
  const receipts = useReceipts();
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const receivedTetri = Math.round(Number(received || '0') * 100);
  const change = receivedTetri - order.total;
  const idem = useRef(newIdempotencyKey('cash'));

  const confirm = async () => {
    setBusy(true);
    try {
      const p = await api.payments.confirmCash(order.id, { amountReceived: receivedTetri, idempotencyKey: idem.current });
      await cashDrawer.open();
      const fresh = await api.orders.get(order.id);
      receipts.show(receiptFor(fresh, branchName));
      toast.success(`${order.publicNumber} გადახდილია`, change > 0 ? `ხურდა ${formatGel(change)}` : undefined);
      onPaid();
      return p;
    } catch (e) {
      const err = e as ApiError;
      toast.error(err.isConflict ? 'შეკვეთა უკვე დამუშავებულია' : 'შეცდომა', err.message);
      idem.current = newIdempotencyKey('cash');
    } finally {
      setBusy(false);
    }
  };

  const quick = [order.total, Math.ceil(order.total / 500) * 500, Math.ceil(order.total / 1000) * 1000, Math.ceil(order.total / 2000) * 2000].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-4xl font-extrabold tracking-wider">{order.publicNumber}</div>
          <div className="text-xs text-ink-muted">
            {sourceLabels[order.source]} · {formatTime(order.createdAt)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <OrderStatusBadge status={order.status} />
          <button onClick={onClose} className="text-sm text-ink-muted">
            ✕ დახურვა
          </button>
        </div>
      </div>
      <ul className="my-3 divide-y divide-line text-sm">
        {order.items.map((i) => (
          <li key={i.id} className="flex justify-between py-1.5">
            <span>
              <b>{i.quantity}×</b> {i.name}
            </span>
            <span className="tabular">{formatGel(i.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-2xl font-extrabold">
        <span>სულ</span>
        <span className="tabular">{formatGel(order.total)}</span>
      </div>

      {order.status === 'AWAITING_PAYMENT' && canConfirm ? (
        <div className="mt-4 flex flex-1 flex-col gap-3">
          <div className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3">
            <span className="text-sm text-ink-muted">მიღებული თანხა</span>
            <span className="tabular text-2xl font-bold">{received || '0'} ₾</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quick.map((v) => (
              <Button key={v} size="sm" variant="outline" onClick={() => setReceived(String(v / 100))}>
                {formatGel(v)}
              </Button>
            ))}
          </div>
          <NumberPad
            onDigit={(d) => setReceived((r) => (r === '0' ? d : r + d))}
            onBackspace={() => setReceived((r) => r.slice(0, -1))}
            onClear={() => setReceived('')}
          />
          <button className="rounded-xl bg-canvas py-2 text-sm" onClick={() => setReceived((r) => (r.includes('.') ? r : r + '.'))}>
            .
          </button>
          <div className={cx('text-right text-lg font-semibold', change < 0 ? 'text-danger' : 'text-ok')}>{receivedTetri > 0 && (change >= 0 ? `ხურდა ${formatGel(change)}` : `აკლია ${formatGel(-change)}`)}</div>
          <Button size="xl" block variant="success" disabled={receivedTetri < order.total} loading={busy} onClick={confirm}>
            ✓ MARK AS PAID
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-canvas p-3 text-sm text-ink-muted">{order.status !== 'AWAITING_PAYMENT' ? 'შეკვეთა უკვე დამუშავებულია' : 'არ გაქვთ გადახდის დადასტურების უფლება'}</div>
      )}
    </div>
  );
}

// ───────────────────────────── A. new order ──────────────────────────────

interface Line {
  product: CatalogProductView;
  quantity: number;
}

function NewOrder({ branchId, branchName, onDone }: { branchId: string; branchName: string; onDone: () => void }) {
  const { api, rt } = useSession();
  const toast = useToast();
  const receipts = useReceipts();
  const catalog = useResource<CatalogView>(() => api.catalog.get(branchId, 'POS', 'ka'), [branchId], { pollMs: 120_000 });
  const [categoryId, setCategoryId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [checkout, setCheckout] = useState<null | 'CASH' | 'CARD'>(null);
  const [placed, setPlaced] = useState<{ order: OrderView; payment: PaymentView | null } | null>(null);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const idem = useRef(newIdempotencyKey('pos'));
  const total = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const cats = catalog.data?.categories ?? [];
  const effectiveCat = categoryId || cats[0]?.id || '';
  const products = useMemo(() => (catalog.data?.products ?? []).filter((p) => p.categoryId === effectiveCat), [catalog.data, effectiveCat]);

  const add = (p: CatalogProductView) =>
    setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { product: p, quantity: 1 }]));
  const reset = () => {
    setLines([]);
    setCustomerName('');
    setCheckout(null);
    setPlaced(null);
    setReceived('');
    idem.current = newIdempotencyKey('pos');
    onDone();
  };

  const place = async (method: 'CASH' | 'CARD') => {
    setBusy(true);
    try {
      const res = await api.orders.create({
        branchId,
        source: 'POS',
        paymentMethod: method,
        pickupType: 'ASAP',
        customerName: customerName || undefined,
        idempotencyKey: `${idem.current}:${method}`,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, modifierIds: [] })),
      });
      setPlaced({ order: res.order, payment: res.payment });
      setCheckout(method);
    } catch (e) {
      toast.error('შეკვეთა ვერ შეიქმნა', (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  // card: follow payment status
  useRealtimeEvents(rt, (e) => {
    if (placed?.payment && e.orderId === placed.order.id) api.payments.get(placed.payment.id).then((p) => setPlaced((x) => (x ? { ...x, payment: p } : x)));
  }, ['PAYMENT_COMPLETED', 'PAYMENT_FAILED']);
  useEffect(() => {
    const p = placed?.payment;
    if (!p || (p.status !== 'PENDING' && p.status !== 'INITIATED')) return;
    const id = setInterval(() => api.payments.get(p.id).then((np) => setPlaced((x) => (x ? { ...x, payment: np } : x))), 2000);
    return () => clearInterval(id);
  }, [placed?.payment?.id, placed?.payment?.status, api, placed?.payment]);
  useEffect(() => {
    if (placed?.payment?.status === 'SUCCEEDED') {
      api.orders.get(placed.order.id).then((o) => receipts.show(receiptFor(o, branchName)));
      toast.success(`${placed.order.publicNumber} გადახდილია ბარათით`);
    }
  }, [placed?.payment?.status, placed?.order.id, placed?.order.publicNumber, api, branchName, toast, receipts]);

  const receivedTetri = Math.round(Number(received || '0') * 100);

  return (
    <div className="grid h-full grid-cols-[160px_1fr_400px]">
      <aside className="overflow-y-auto border-r border-line bg-surface p-2">
        {cats.map((c) => (
          <button key={c.id} onClick={() => setCategoryId(c.id)} className={cx('mb-1 block w-full rounded-lg px-3 py-3 text-left text-sm font-semibold', c.id === effectiveCat ? 'bg-brand text-brand-ink' : 'hover:bg-canvas')}>
            {c.name}
          </button>
        ))}
      </aside>
      <section className="overflow-y-auto p-3">
        {!catalog.data && <Spinner />}
        <div className="grid grid-cols-3 gap-2 xl:grid-cols-4">
          {products.map((p) => (
            <button key={p.id} onClick={() => add(p)} className="card flex flex-col items-start p-3 text-left transition active:scale-95">
              <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-tight">{p.name}</span>
              <span className="mt-1 tabular text-base font-bold">{formatGel(p.price)}</span>
            </button>
          ))}
        </div>
      </section>
      <aside className="flex flex-col border-l border-line bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold">კალათა</h3>
          <Button variant="ghost" size="sm" onClick={reset}>
            გასუფთავება
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {lines.length === 0 && <div className="py-10 text-center text-sm text-ink-muted">დაამატეთ პროდუქტები</div>}
          {lines.map((l) => (
            <div key={l.product.id} className="flex items-center gap-2 border-b border-line py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{l.product.name}</div>
                <div className="text-xs text-ink-muted">{formatGel(l.product.price)}</div>
              </div>
              <QuantityStepper value={l.quantity} onChange={(q) => setLines((ls) => (q <= 0 ? ls.filter((x) => x.product.id !== l.product.id) : ls.map((x) => (x.product.id === l.product.id ? { ...x, quantity: q } : x))))} />
              <span className="w-20 text-right tabular font-bold">{formatGel(l.product.price * l.quantity)}</span>
            </div>
          ))}
        </div>
        <Input className="mt-2" placeholder="მომხმარებლის სახელი (არასავალდებულო)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <div className="my-3 flex justify-between text-2xl font-extrabold">
          <span>სულ</span>
          <span className="tabular">{formatGel(total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="success" disabled={!lines.length} loading={busy} onClick={() => place('CASH')}>
            💵 ნაღდი
          </Button>
          <Button size="lg" disabled={!lines.length} loading={busy} onClick={() => place('CARD')}>
            💳 ბარათი
          </Button>
        </div>
      </aside>

      {/* checkout modal */}
      <Modal open={!!placed} onClose={() => undefined} title={placed ? `შეკვეთა ${placed.order.publicNumber}` : ''} size="md">
        {placed && checkout === 'CASH' && (
          <div className="space-y-3">
            <div className="flex justify-between text-xl font-bold">
              <span>სულ</span>
              <span className="tabular">{formatGel(placed.order.total)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3">
              <span className="text-sm text-ink-muted">მიღებული</span>
              <span className="tabular text-2xl font-bold">{received || '0'} ₾</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[placed.order.total, Math.ceil(placed.order.total / 1000) * 1000, Math.ceil(placed.order.total / 2000) * 2000, Math.ceil(placed.order.total / 5000) * 5000]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((v) => (
                  <Button key={v} size="sm" variant="outline" onClick={() => setReceived(String(v / 100))}>
                    {formatGel(v)}
                  </Button>
                ))}
            </div>
            <NumberPad onDigit={(d) => setReceived((r) => r + d)} onBackspace={() => setReceived((r) => r.slice(0, -1))} onClear={() => setReceived('')} />
            <div className={cx('text-right font-semibold', receivedTetri - placed.order.total < 0 ? 'text-danger' : 'text-ok')}>
              {receivedTetri > 0 && (receivedTetri >= placed.order.total ? `ხურდა ${formatGel(receivedTetri - placed.order.total)}` : `აკლია ${formatGel(placed.order.total - receivedTetri)}`)}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={async () => { await api.orders.cancel(placed.order.id, 'POS: გაუქმდა გადახდამდე').catch(() => undefined); reset(); }}>
                გაუქმება
              </Button>
              <Button
                block
                size="lg"
                variant="success"
                loading={busy}
                disabled={receivedTetri < placed.order.total}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.payments.confirmCash(placed.order.id, { amountReceived: receivedTetri, idempotencyKey: `${idem.current}:cashconfirm` });
                    await cashDrawer.open();
                    const o = await api.orders.get(placed.order.id);
                    receipts.show(receiptFor(o, branchName));
                    toast.success(`${o.publicNumber} გადახდილია`, `ხურდა ${formatGel(receivedTetri - o.total)}`);
                    reset();
                  } catch (e) {
                    toast.error('შეცდომა', (e as ApiError).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                ✓ MARK AS PAID
              </Button>
            </div>
          </div>
        )}
        {placed && checkout === 'CARD' && (
          <div className="space-y-4 text-center">
            {placed.payment?.status === 'SUCCEEDED' ? (
              <>
                <div className="text-6xl">✅</div>
                <div className="text-xl font-bold">გადახდილია · {placed.payment.maskedPan}</div>
                <div className="text-4xl font-extrabold tracking-wider">{placed.order.publicNumber}</div>
                <Button block size="lg" onClick={reset}>
                  შემდეგი შეკვეთა
                </Button>
              </>
            ) : placed.payment?.status === 'FAILED' || placed.payment?.status === 'CANCELLED' ? (
              <>
                <div className="text-6xl">⚠️</div>
                <div className="text-xl font-bold text-danger">გადახდა ვერ შესრულდა ({placed.payment.failureCode})</div>
                <div className="flex gap-2">
                  <Button
                    block
                    onClick={async () => {
                      const p = await api.payments.initiate(placed.order.id, { method: 'CARD', idempotencyKey: newIdempotencyKey('pos-retry') }).catch((e) => {
                        toast.error('შეცდომა', (e as ApiError).message);
                        return null;
                      });
                      if (p) setPlaced({ ...placed, payment: p });
                    }}
                  >
                    თავიდან ცდა
                  </Button>
                  <Button block variant="outline" onClick={() => { setCheckout('CASH'); setPlaced({ ...placed, payment: null }); }}>
                    ნაღდით
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Spinner className="mx-auto h-12 w-12 text-brand-dark" />
                <div className="text-xl font-bold">ტერმინალის მოლოდინში… {formatGel(placed.order.total)}</div>
                <Button variant="ghost" onClick={() => placed.payment && api.payments.reconcile(placed.payment.id).then((p) => setPlaced({ ...placed, payment: p }))}>
                  სტატუსის შემოწმება
                </Button>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
