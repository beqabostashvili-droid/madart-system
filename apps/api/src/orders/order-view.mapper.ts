import type { Prisma } from '@madart/database';
import { DEFAULT_THRESHOLDS, deriveProductionDisplayStatus, type DisplayStatusThresholds } from '@madart/domain';
import type { OrderItemView, OrderStatusHistoryView, OrderSummaryView, OrderView, PaymentView, ProductionTaskView } from '@madart/types';

export const orderInclude = {
  items: { include: { modifiers: true }, orderBy: { sortOrder: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const } },
  tasks: { include: { station: true, orderItem: true }, orderBy: { plannedStartAt: 'asc' as const } },
  history: { orderBy: { seq: 'asc' as const } },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type TaskRow = Prisma.ProductionTaskGetPayload<{ include: { station: true; orderItem: true; order: true } }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toItemView(i: OrderRow['items'][number]): OrderItemView {
  return {
    id: i.id,
    productId: i.productId,
    name: i.nameSnapshot,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
    productionRequired: i.productionRequired,
    stationId: i.stationIdSnapshot,
    status: i.status,
    note: i.note,
    modifiers: i.modifiers.map((m) => ({ id: m.id, name: m.nameSnapshot, priceDelta: m.priceDelta })),
  };
}

export function toPaymentView(p: OrderRow['payments'][number]): PaymentView {
  return {
    id: p.id,
    orderId: p.orderId,
    method: p.method,
    provider: p.provider,
    status: p.status,
    amount: p.amount,
    refundedAmount: p.refundedAmount,
    providerReference: p.providerReference,
    failureCode: p.failureCode,
    maskedPan: p.maskedPan,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toTaskView(
  t: OrderRow['tasks'][number],
  order: { publicNumber: string; targetReadyAt: Date; source: OrderRow['source'] },
  now: Date,
  thresholds: DisplayStatusThresholds = DEFAULT_THRESHOLDS,
): ProductionTaskView {
  return {
    id: t.id,
    orderId: t.orderId,
    orderItemId: t.orderItemId,
    publicNumber: order.publicNumber,
    branchId: t.branchId,
    stationId: t.stationId,
    stationCode: t.station.code,
    productName: t.orderItem.nameSnapshot,
    quantity: t.quantity,
    status: t.status,
    displayStatus: deriveProductionDisplayStatus(t, now, thresholds),
    durationMinutes: t.durationMinutes,
    priority: t.priority,
    plannedStartAt: t.plannedStartAt.toISOString(),
    plannedReadyAt: t.plannedReadyAt.toISOString(),
    targetReadyAt: order.targetReadyAt.toISOString(),
    actualStartedAt: iso(t.actualStartedAt),
    actualReadyAt: iso(t.actualReadyAt),
    orderSource: order.source,
    note: t.orderItem.note,
    createdAt: t.createdAt.toISOString(),
    version: t.version,
  };
}

export function toHistoryView(h: OrderRow['history'][number]): OrderStatusHistoryView {
  return { id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, at: h.at.toISOString(), actorType: h.actorType, actorId: h.actorId, reason: h.reason };
}

export function toOrderSummary(o: OrderRow | (Omit<OrderRow, 'items' | 'payments' | 'tasks' | 'history'> & { items: { quantity: number }[] })): OrderSummaryView {
  return {
    id: o.id,
    publicNumber: o.publicNumber,
    branchId: o.branchId,
    source: o.source,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    pickupType: o.pickupType,
    targetReadyAt: o.targetReadyAt.toISOString(),
    total: o.total,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    customerName: o.customerName,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    readyForPickupAt: iso(o.readyForPickupAt),
    completedAt: iso(o.completedAt),
  };
}

export function toOrderView(o: OrderRow, now: Date, thresholds: DisplayStatusThresholds = DEFAULT_THRESHOLDS): OrderView {
  return {
    ...toOrderSummary(o),
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    currency: o.currency,
    customerPhone: o.customerPhone,
    note: o.note,
    items: o.items.map(toItemView),
    payments: o.payments.map(toPaymentView),
    tasks: o.tasks.map((t) => toTaskView(t, o, now, thresholds)),
    history: o.history.map(toHistoryView),
    paidAt: iso(o.paidAt),
    confirmedAt: iso(o.confirmedAt),
    cancelledAt: iso(o.cancelledAt),
    version: o.version,
  };
}
