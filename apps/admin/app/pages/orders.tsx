'use client';
import { OrderStatus } from '@madart/domain';
import type { OrderSummaryView, OrderView } from '@madart/types';
import { Button, Field, formatDateTime, formatGel, formatTime, Input, Modal, OrderStatusBadge, PageTitle, PaymentStatusBadge, ProductionStatusBadge, Select, sourceLabels, Spinner, useRealtimeEvents, useResource, useSession } from '@madart/ui';
import { useState } from 'react';
import { useAdmin } from '../AdminApp';
import { Stat, Table, useSubmit } from './shared';

export function DashboardPage() {
  const { api, rt } = useSession();
  const { branchId } = useAdmin();
  const dash = useResource(() => api.reports.dashboard(branchId ?? undefined), [branchId], { pollMs: 30_000 });
  useRealtimeEvents(rt, () => void dash.refresh(), ['ORDER_COMPLETED', 'PAYMENT_COMPLETED', 'PRODUCTION_ITEM_READY']);
  if (!dash.data) return <Spinner />;
  const d = dash.data;
  return (
    <>
      <PageTitle title="Dashboard" subtitle={`დღეს · ${d.date}`} />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sales today" value={formatGel(d.salesToday)} />
        <Stat label="Orders today" value={d.ordersToday} />
        <Stat label="Avg order" value={formatGel(d.averageOrderValue)} />
        <Stat label="Active orders" value={d.activeOrders} />
        <Stat label="Avg production" value={d.averageProductionMinutes === null ? '—' : `${d.averageProductionMinutes} წთ`} hint="actual start → ready" />
        <Stat label="Late items" value={d.lateOrders} hint={d.averageDelayMinutes === null ? '' : `avg delay ${d.averageDelayMinutes} წთ`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 font-bold">Orders by source</h3>
          {Object.keys(d.ordersBySource).length === 0 && <div className="text-sm text-ink-muted">დღეს შეკვეთები არ არის</div>}
          {Object.entries(d.ordersBySource).map(([s, n]) => (
            <div key={s} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
              <span>{sourceLabels[s] ?? s}</span>
              <span className="tabular font-semibold">
                {n} · {formatGel(d.salesBySource[s] ?? 0)}
              </span>
            </div>
          ))}
        </div>
        <div className="card p-4">
          <h3 className="mb-3 font-bold">Top products</h3>
          {d.topProducts.map((p) => (
            <div key={p.productId} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
              <span>{p.name}</span>
              <span className="tabular font-semibold">
                {p.quantity} · {formatGel(p.revenue)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function OrdersPage({ go, route }: { go: (r: string) => void; route: string }) {
  const { api, rt } = useSession();
  const { branchId } = useAdmin();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const orders = useResource(() => api.orders.list({ branchId: branchId ?? undefined, status: status || undefined, search: search || undefined, limit: 100 }), [branchId, status, search], { pollMs: 30_000 });
  useRealtimeEvents(rt, () => void orders.refresh(), ['ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'PAYMENT_COMPLETED']);
  const selectedId = route.split('/')[1];

  return (
    <>
      <PageTitle title="Orders" subtitle={orders.data ? `${orders.data.total} შეკვეთა` : ''} />
      <div className="mb-4 flex gap-3">
        <Input placeholder="ძებნა: ნომერი, სახელი, ტელეფონი" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs">
          <option value="">ყველა სტატუსი</option>
          {Object.values(OrderStatus).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <Table<OrderSummaryView>
        rows={orders.data?.items ?? []}
        rowKey={(o) => o.id}
        onRow={(o) => go(`orders/${o.id}`)}
        columns={[
          { key: 'n', label: '№', render: (o) => <span className="font-bold">{o.publicNumber}</span> },
          { key: 'at', label: 'შექმნა', render: (o) => formatDateTime(o.createdAt) },
          { key: 'src', label: 'წყარო', render: (o) => sourceLabels[o.source] ?? o.source },
          { key: 'target', label: 'მიზანი', render: (o) => `${o.pickupType === 'SCHEDULED' ? '📅 ' : ''}${formatTime(o.targetReadyAt)}` },
          { key: 'items', label: 'ერთ.', render: (o) => o.itemCount, className: 'text-right' },
          { key: 'total', label: 'ჯამი', render: (o) => formatGel(o.total), className: 'text-right tabular' },
          { key: 'status', label: 'სტატუსი', render: (o) => <OrderStatusBadge status={o.status} /> },
          { key: 'pay', label: 'გადახდა', render: (o) => <PaymentStatusBadge status={o.paymentStatus} /> },
        ]}
      />
      {selectedId && <OrderDetail id={selectedId} onClose={() => go('orders')} onChanged={() => void orders.refresh()} />}
    </>
  );
}

function OrderDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { api, rt } = useSession();
  const { can } = useAdmin();
  const order = useResource<OrderView>(() => api.orders.get(id), [id]);
  const timeline = useResource(() => api.orders.timeline(id), [id]);
  useRealtimeEvents(rt, (e) => {
    if (e.orderId === id) {
      void order.refresh();
      void timeline.refresh();
    }
  });
  const { submit, busy } = useSubmit();
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<{ paymentId: string; amount: string } | null>(null);
  const o = order.data;

  return (
    <Modal open onClose={onClose} title={o ? `შეკვეთა ${o.publicNumber}` : 'შეკვეთა'} size="xl">
      {!o ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <OrderStatusBadge status={o.status} />
              <PaymentStatusBadge status={o.paymentStatus} />
              <span className="text-sm text-ink-muted">
                {sourceLabels[o.source]} · {o.paymentMethod} · {o.pickupType} {formatTime(o.targetReadyAt)}
              </span>
            </div>
            {(o.customerName || o.customerPhone || o.note) && (
              <div className="rounded-lg bg-canvas p-3 text-sm">
                {o.customerName} {o.customerPhone} {o.note && <div>📝 {o.note}</div>}
              </div>
            )}
            <div>
              <h4 className="mb-1 font-semibold">პროდუქტები</h4>
              {o.items.map((i) => (
                <div key={i.id} className="flex justify-between border-b border-line py-1 text-sm">
                  <span>
                    {i.quantity}× {i.name} <span className="text-xs text-ink-muted">{i.status}</span>
                  </span>
                  <span className="tabular">{formatGel(i.lineTotal)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-bold">
                <span>ჯამი</span>
                <span className="tabular">{formatGel(o.total)}</span>
              </div>
            </div>
            <div>
              <h4 className="mb-1 font-semibold">წარმოება</h4>
              {o.tasks.length === 0 && <div className="text-sm text-ink-muted">ამოცანები არ არის</div>}
              {o.tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-line py-1 text-sm">
                  <span>
                    {t.stationCode} · {t.productName} ×{t.quantity}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-muted">
                    {formatTime(t.plannedStartAt)}→{formatTime(t.plannedReadyAt)}
                    {t.actualStartedAt && ` · ფაქტ. ${formatTime(t.actualStartedAt)}→${formatTime(t.actualReadyAt)}`}
                    <ProductionStatusBadge status={t.displayStatus} />
                  </span>
                </div>
              ))}
            </div>
            <div>
              <h4 className="mb-1 font-semibold">გადახდები</h4>
              {o.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-line py-1 text-sm">
                  <span>
                    {p.method} · {p.provider} · {p.status} {p.maskedPan ?? ''} {p.failureCode ?? ''}
                  </span>
                  <span className="flex items-center gap-2 tabular">
                    {formatGel(p.amount)}
                    {p.refundedAmount > 0 && <span className="text-xs text-danger">-{formatGel(p.refundedAmount)}</span>}
                    {can('orders.refund') && (p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED') && (
                      <Button size="sm" variant="outline" onClick={() => setRefund({ paymentId: p.id, amount: String((p.amount - p.refundedAmount) / 100) })}>
                        Refund
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {can('orders.cancel') && !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(o.status) && (
              <div className="flex gap-2">
                <Input placeholder="გაუქმების მიზეზი" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button
                  variant="danger"
                  disabled={!reason.trim()}
                  loading={busy}
                  onClick={async () => {
                    await submit(() => api.orders.cancel(o.id, reason), 'შეკვეთა გაუქმდა');
                    setReason('');
                    void order.refresh();
                    onChanged();
                  }}
                >
                  გაუქმება
                </Button>
              </div>
            )}
            {refund && (
              <div className="flex items-end gap-2 rounded-lg bg-danger-soft p-3">
                <Field label="თანხა (₾)">
                  <Input value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
                </Field>
                <Field label="მიზეზი">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <Button
                  variant="danger"
                  loading={busy}
                  disabled={!reason.trim()}
                  onClick={async () => {
                    await submit(() => api.payments.refund(refund.paymentId, { amount: Math.round(Number(refund.amount) * 100), reason, idempotencyKey: `rf-${refund.paymentId}-${Date.now()}` }), 'Refund შესრულდა');
                    setRefund(null);
                    setReason('');
                    void order.refresh();
                    onChanged();
                  }}
                >
                  Refund
                </Button>
                <Button variant="ghost" onClick={() => setRefund(null)}>
                  ✕
                </Button>
              </div>
            )}
          </div>
          <div>
            <h4 className="mb-2 font-semibold">Timeline</h4>
            <ol className="relative border-l border-line pl-4 text-sm">
              {(timeline.data ?? []).map((e, i) => (
                <li key={i} className="mb-3">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-brand" />
                  <div className="tabular text-xs text-ink-muted">{formatDateTime(e.at)}</div>
                  <div className="font-medium">{e.label}</div>
                  {e.detail && <div className="text-xs text-ink-muted">{e.detail}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}
