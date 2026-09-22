'use client';
import { type ApiError, createApiClient, newIdempotencyKey } from '@madart/api-client';
import type { Locale } from '@madart/domain';
import type { BranchView, CatalogProductView, CatalogView, OrderView, PickupSlotsResponse } from '@madart/types';
import { Button, cx, formatGel, formatTime, Input, OrderStatusBadge, QuantityStepper, Spinner, ToastProvider, useResource, useStoredState, useToast } from '@madart/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const api = createApiClient({ baseUrl: API_URL, getToken: () => null });

const T = {
  ka: { pick: 'აირჩიეთ ფილიალი', cart: 'კალათა', empty: 'კალათა ცარიელია', total: 'ჯამი', next: 'გაგრძელება', pickup: 'აღების დრო', asap: 'რაც შეიძლება მალე', scheduled: 'დაგეგმილი დრო', name: 'სახელი', phone: 'ტელეფონი', pay: 'გადახდა', paying: 'გადახდა მიმდინარეობს…', order: 'შეკვეთა', status: 'სტატუსი', readyAt: 'აღება', back: 'უკან', noSlots: 'დღეს თავისუფალი დრო არ არის', full: 'სავსეა', failed: 'გადახდა ვერ შესრულდა', retry: 'თავიდან', newOrder: 'ახალი შეკვეთა', trackHint: 'ეს გვერდი ავტომატურად განახლდება' },
  en: { pick: 'Choose a branch', cart: 'Cart', empty: 'Cart is empty', total: 'Total', next: 'Continue', pickup: 'Pickup time', asap: 'As soon as possible', scheduled: 'Scheduled pickup', name: 'Name', phone: 'Phone', pay: 'Pay', paying: 'Processing payment…', order: 'Order', status: 'Status', readyAt: 'Pickup', back: 'Back', noSlots: 'No free slots today', full: 'full', failed: 'Payment failed', retry: 'Retry', newOrder: 'New order', trackHint: 'This page updates automatically' },
  ru: { pick: 'Выберите филиал', cart: 'Корзина', empty: 'Корзина пуста', total: 'Итого', next: 'Продолжить', pickup: 'Время получения', asap: 'Как можно скорее', scheduled: 'Запланированное время', name: 'Имя', phone: 'Телефон', pay: 'Оплатить', paying: 'Оплата…', order: 'Заказ', status: 'Статус', readyAt: 'Получение', back: 'Назад', noSlots: 'Сегодня нет свободного времени', full: 'занято', failed: 'Оплата не прошла', retry: 'Повторить', newOrder: 'Новый заказ', trackHint: 'Страница обновляется автоматически' },
} as const;
type Key = keyof (typeof T)['ka'];

type Step = 'branch' | 'catalog' | 'cart' | 'pickup' | 'pay' | 'track';
interface Line {
  product: CatalogProductView;
  quantity: number;
}

export function MobileApp() {
  return (
    <ToastProvider position="bottom-center">
      <Flow />
    </ToastProvider>
  );
}

function Flow() {
  const toast = useToast();
  const [locale, setLocale] = useStoredState<Locale>('madart.mobile.locale', 'ka');
  const t = (k: Key) => T[locale][k];
  const [branchId, setBranchId] = useStoredState<string | null>('madart.mobile.branch', null);
  const [qrToken, setQrToken] = useStoredState<string | null>('madart.mobile.lastOrder', null);
  const [step, setStep] = useState<Step>(qrToken ? 'track' : branchId ? 'catalog' : 'branch');
  const [lines, setLines] = useState<Line[]>([]);
  const [pickup, setPickup] = useState<{ type: 'ASAP' | 'SCHEDULED'; at?: string }>({ type: 'ASAP' });
  const [contact, setContact] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const idem = useRef(newIdempotencyKey('mobile'));

  const branches = useResource(() => api.branches.list(), []);
  const catalog = useResource<CatalogView>(() => api.catalog.get(branchId!, 'MOBILE', locale), [branchId, locale], { enabled: !!branchId });
  const total = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const branch = branches.data?.find((b) => b.id === branchId);

  const placeOrder = async () => {
    if (!branchId) return;
    setBusy(true);
    try {
      const res = await api.orders.create({
        branchId,
        source: 'MOBILE',
        paymentMethod: 'ONLINE',
        pickupType: pickup.type,
        pickupAt: pickup.type === 'SCHEDULED' ? pickup.at : undefined,
        customerName: contact.name || undefined,
        customerPhone: contact.phone || undefined,
        idempotencyKey: idem.current,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, modifierIds: [] })),
      });
      const token = res.qrPayload.split(':')[2]!;
      setQrToken(token);
      setLines([]);
      idem.current = newIdempotencyKey('mobile');
      setStep('track');
    } catch (e) {
      toast.error(t('failed'), (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <button onClick={() => (step === 'catalog' || step === 'track' ? setStep('branch') : step === 'branch' ? undefined : setStep(step === 'cart' ? 'catalog' : step === 'pickup' ? 'cart' : 'pickup'))} className="text-sm text-ink-muted">
          {step !== 'branch' && `← ${t('back')}`}
        </button>
        <span className="rounded-lg bg-brand px-3 py-1 font-extrabold text-brand-ink">MADART</span>
        <div className="flex gap-1 text-xs">
          {(['ka', 'en', 'ru'] as Locale[]).map((l) => (
            <button key={l} onClick={() => setLocale(l)} className={cx('rounded px-1.5 py-0.5 uppercase', l === locale ? 'bg-ink text-white' : 'text-ink-muted')}>
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 p-4 pb-28">
        {step === 'branch' && (
          <>
            <h1 className="mb-4 text-2xl font-bold">{t('pick')}</h1>
            {!branches.data && <Spinner />}
            <div className="space-y-3">
              {branches.data?.map((b: BranchView) => (
                <button key={b.id} onClick={() => { setBranchId(b.id); setStep('catalog'); }} className="card w-full p-4 text-left active:scale-[0.99]">
                  <div className="text-lg font-bold">{b.name}</div>
                  <div className="text-sm text-ink-muted">{b.address}</div>
                </button>
              ))}
            </div>
            {qrToken && (
              <Button variant="outline" block className="mt-6" onClick={() => setStep('track')}>
                {t('order')} →
              </Button>
            )}
          </>
        )}

        {step === 'catalog' && (
          <Catalog catalog={catalog.data} lines={lines} onAdd={(p) => setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { product: p, quantity: 1 }]))} />
        )}

        {step === 'cart' && (
          <>
            <h1 className="mb-4 text-2xl font-bold">{t('cart')}</h1>
            {lines.length === 0 && <div className="text-ink-muted">{t('empty')}</div>}
            {lines.map((l) => (
              <div key={l.product.id} className="card mb-2 flex items-center gap-3 p-3">
                {l.product.imageUrl && <img src={l.product.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.product.name}</div>
                  <div className="text-sm text-ink-muted">{formatGel(l.product.price)}</div>
                </div>
                <QuantityStepper value={l.quantity} onChange={(q) => setLines((ls) => (q <= 0 ? ls.filter((x) => x.product.id !== l.product.id) : ls.map((x) => (x.product.id === l.product.id ? { ...x, quantity: q } : x))))} />
              </div>
            ))}
          </>
        )}

        {step === 'pickup' && branchId && <Pickup branchId={branchId} lines={lines} value={pickup} onChange={setPickup} t={t} />}

        {step === 'pay' && (
          <>
            <h1 className="mb-4 text-2xl font-bold">{t('pay')}</h1>
            <div className="card mb-4 p-4 text-sm">
              <div className="mb-2 font-semibold">{branch?.name}</div>
              {lines.map((l) => (
                <div key={l.product.id} className="flex justify-between py-0.5">
                  <span>
                    {l.quantity}× {l.product.name}
                  </span>
                  <span className="tabular">{formatGel(l.product.price * l.quantity)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-line pt-2 font-bold">
                <span>{t('total')}</span>
                <span className="tabular">{formatGel(total)}</span>
              </div>
              <div className="mt-2 text-ink-muted">
                {t('pickup')}: {pickup.type === 'ASAP' ? t('asap') : formatTime(pickup.at)}
              </div>
            </div>
            <div className="space-y-3">
              <Input placeholder={t('name')} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              <Input placeholder={t('phone')} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </div>
            <p className="mt-3 text-xs text-ink-muted">Mock online payment (provider integration pending). Totals ending in .99 are declined for testing.</p>
          </>
        )}

        {step === 'track' && qrToken && <Track qrToken={qrToken} t={t} onNew={() => { setQrToken(null); setStep('catalog'); }} />}
      </main>

      {(step === 'catalog' || step === 'cart' || step === 'pickup' || step === 'pay') && (
        <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-line bg-surface p-4">
          {step === 'catalog' && (
            <Button block size="lg" disabled={!lines.length} onClick={() => setStep('cart')}>
              🛒 {t('cart')} · {formatGel(total)}
            </Button>
          )}
          {step === 'cart' && (
            <Button block size="lg" disabled={!lines.length} onClick={() => setStep('pickup')}>
              {t('next')} · {formatGel(total)}
            </Button>
          )}
          {step === 'pickup' && (
            <Button block size="lg" disabled={pickup.type === 'SCHEDULED' && !pickup.at} onClick={() => setStep('pay')}>
              {t('next')}
            </Button>
          )}
          {step === 'pay' && (
            <Button block size="lg" loading={busy} onClick={placeOrder}>
              {t('pay')} {formatGel(total)}
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}

function Catalog({ catalog, lines, onAdd }: { catalog: CatalogView | null; lines: Line[]; onAdd: (p: CatalogProductView) => void }) {
  const [cat, setCat] = useState('');
  const effective = cat || catalog?.categories[0]?.id || '';
  const products = useMemo(() => (catalog?.products ?? []).filter((p) => p.categoryId === effective), [catalog, effective]);
  if (!catalog) return <Spinner />;
  return (
    <>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 scrollbar-none">
        {catalog.categories.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-semibold', c.id === effective ? 'bg-ink text-white' : 'bg-surface border border-line')}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {products.map((p) => {
          const inCart = lines.find((l) => l.product.id === p.id)?.quantity ?? 0;
          return (
            <button key={p.id} onClick={() => onAdd(p)} className="card relative flex flex-col overflow-hidden p-0 text-left active:scale-[0.98]">
              <div className="aspect-[4/3] bg-canvas">{p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
              <div className="p-2">
                <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-tight">{p.name}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="tabular font-bold">{formatGel(p.price)}</span>
                  {p.productionTimeMinutes > 0 && <span className="text-xs text-ink-muted">⏱ {p.productionTimeMinutes}′</span>}
                </div>
              </div>
              {inCart > 0 && <span className="absolute right-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink">{inCart}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Pickup({ branchId, lines, value, onChange, t }: { branchId: string; lines: Line[]; value: { type: 'ASAP' | 'SCHEDULED'; at?: string }; onChange: (v: { type: 'ASAP' | 'SCHEDULED'; at?: string }) => void; t: (k: Key) => string }) {
  const quote = useResource<PickupSlotsResponse>(() => api.orders.quoteSlots({ branchId, items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, modifierIds: [] })) }), [branchId, lines.length], { pollMs: 60_000 });
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('pickup')}</h1>
      <button onClick={() => onChange({ type: 'ASAP' })} className={cx('card mb-3 w-full p-4 text-left', value.type === 'ASAP' && 'ring-2 ring-brand')}>
        <div className="font-bold">⚡ {t('asap')}</div>
        {quote.data && <div className="text-sm text-ink-muted">~ {formatTime(quote.data.asapReadyAt)}</div>}
      </button>
      <div className={cx('card p-4', value.type === 'SCHEDULED' && 'ring-2 ring-brand')}>
        <div className="mb-2 font-bold">📅 {t('scheduled')}</div>
        {!quote.data ? (
          <Spinner />
        ) : quote.data.slots.length === 0 ? (
          <div className="text-sm text-ink-muted">{t('noSlots')}</div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {quote.data.slots.map((s) => (
              <button
                key={s.startsAt}
                disabled={!s.available}
                onClick={() => onChange({ type: 'SCHEDULED', at: s.startsAt })}
                className={cx('rounded-lg border px-2 py-2 text-sm font-semibold tabular', value.at === s.startsAt ? 'border-ink bg-ink text-white' : 'border-line bg-surface', !s.available && 'line-through opacity-40')}
                title={s.available ? '' : t('full')}
              >
                {formatTime(s.startsAt)}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Track({ qrToken, t, onNew }: { qrToken: string; t: (k: Key) => string; onNew: () => void }) {
  const order = useResource<OrderView>(() => api.orders.track(qrToken), [qrToken], { pollMs: 5000 });
  const o = order.data;
  const payment = o?.payments.at(-1);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (o && (o.status === 'COMPLETED' || o.status === 'CANCELLED' || o.status === 'REFUNDED')) {
      // keep the page but stop nothing – user can start a new order
    }
  }, [o]);
  if (!o) return <Spinner />;
  const pendingPay = o.status === 'AWAITING_PAYMENT' && payment && (payment.status === 'PENDING' || payment.status === 'INITIATED');
  const failedPay = o.status === 'AWAITING_PAYMENT' && payment && (payment.status === 'FAILED' || payment.status === 'CANCELLED');
  const steps = ['PAID', 'SCHEDULED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'COMPLETED'] as const;
  const rank: Record<string, number> = { AWAITING_PAYMENT: 0, PAID: 1, CONFIRMED: 1, SCHEDULED: 2, IN_PRODUCTION: 3, PARTIALLY_READY: 3, READY_FOR_ASSEMBLY: 3, READY_FOR_PICKUP: 4, COMPLETED: 5 };
  const cur = rank[o.status] ?? 0;

  return (
    <div className="text-center">
      <div className="text-sm text-ink-muted">{t('order')}</div>
      <div className="my-3 inline-block rounded-3xl bg-ink px-10 py-4 text-6xl font-extrabold tracking-wider text-brand">{o.publicNumber}</div>
      <div className="mb-4 flex items-center justify-center gap-2">
        <OrderStatusBadge status={o.status} />
        <span className="text-sm text-ink-muted">
          {t('readyAt')} {formatTime(o.targetReadyAt)}
        </span>
      </div>
      {pendingPay && <div className="card mb-4 p-4">{t('paying')}</div>}
      {failedPay && (
        <div className="card mb-4 space-y-2 p-4">
          <div className="font-semibold text-danger">{t('failed')}</div>
          <Button
            block
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                // public retry is not exposed; re-create is the customer path → new order
                onNew();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      <ol className="card mb-4 space-y-2 p-4 text-left text-sm">
        {steps.map((s, i) => (
          <li key={s} className={cx('flex items-center gap-2', i + 1 <= cur ? 'text-ink' : 'text-ink-muted')}>
            <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', i + 1 <= cur ? 'bg-ok text-white' : 'bg-canvas')}>{i + 1 <= cur ? '✓' : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="card mb-4 p-4 text-left text-sm">
        {o.items.map((i) => (
          <div key={i.id} className="flex justify-between py-0.5">
            <span>
              {i.quantity}× {i.name}
            </span>
            <span className="tabular">{formatGel(i.lineTotal)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-bold">
          <span>{t('total')}</span>
          <span className="tabular">{formatGel(o.total)}</span>
        </div>
      </div>
      <p className="mb-4 text-xs text-ink-muted">{t('trackHint')}</p>
      <Button variant="outline" block onClick={onNew}>
        {t('newOrder')}
      </Button>
    </div>
  );
}
