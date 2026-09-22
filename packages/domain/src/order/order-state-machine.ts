import { OrderStatus, ProductionTaskStatus } from '../enums';
import { InvalidTransitionError } from '../errors';

const S = OrderStatus;

/** Allowed forward transitions (see docs/ORDER_LIFECYCLE.md). */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [S.DRAFT]: [S.AWAITING_PAYMENT, S.CANCELLED],
  [S.AWAITING_PAYMENT]: [S.PAID, S.CANCELLED],
  [S.PAID]: [S.CONFIRMED, S.CANCELLED],
  [S.CONFIRMED]: [S.SCHEDULED, S.READY_FOR_ASSEMBLY, S.CANCELLED],
  [S.SCHEDULED]: [S.IN_PRODUCTION, S.PARTIALLY_READY, S.READY_FOR_ASSEMBLY, S.CANCELLED],
  [S.IN_PRODUCTION]: [S.PARTIALLY_READY, S.READY_FOR_ASSEMBLY, S.CANCELLED],
  [S.PARTIALLY_READY]: [S.IN_PRODUCTION, S.READY_FOR_ASSEMBLY, S.CANCELLED],
  [S.READY_FOR_ASSEMBLY]: [S.READY_FOR_PICKUP, S.CANCELLED],
  [S.READY_FOR_PICKUP]: [S.COMPLETED, S.CANCELLED],
  [S.COMPLETED]: [],
  [S.CANCELLED]: [S.REFUNDED],
  [S.REFUNDED]: [],
};

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [S.COMPLETED, S.CANCELLED, S.REFUNDED];

/** Statuses in which the order is visible on the customer display as "preparing". */
export const DISPLAY_PREPARING_STATUSES: readonly OrderStatus[] = [
  S.CONFIRMED,
  S.SCHEDULED,
  S.IN_PRODUCTION,
  S.PARTIALLY_READY,
  S.READY_FOR_ASSEMBLY,
];

/** Statuses after payment and before completion – production is (or will be) running. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  S.PAID,
  S.CONFIRMED,
  S.SCHEDULED,
  S.IN_PRODUCTION,
  S.PARTIALLY_READY,
  S.READY_FOR_ASSEMBLY,
  S.READY_FOR_PICKUP,
];

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) throw new InvalidTransitionError('Order', from, to);
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export function isCancellable(status: OrderStatus): boolean {
  return canTransitionOrder(status, S.CANCELLED);
}

/** Rank used to guarantee rollups never demote an order. */
const PRODUCTION_RANK: Partial<Record<OrderStatus, number>> = {
  [S.SCHEDULED]: 1,
  [S.IN_PRODUCTION]: 2,
  [S.PARTIALLY_READY]: 3,
  [S.READY_FOR_ASSEMBLY]: 4,
};

/**
 * Computes the order status implied by its production tasks.
 * Cancelled tasks are ignored; if every task is cancelled the order is ready
 * for assembly (nothing left to produce).
 */
export function rollupOrderStatusFromTasks(
  tasks: readonly { status: ProductionTaskStatus }[],
): typeof S.SCHEDULED | typeof S.IN_PRODUCTION | typeof S.PARTIALLY_READY | typeof S.READY_FOR_ASSEMBLY {
  const live = tasks.filter((t) => t.status !== ProductionTaskStatus.CANCELLED);
  if (live.length === 0) return S.READY_FOR_ASSEMBLY;
  const ready = live.filter((t) => t.status === ProductionTaskStatus.READY).length;
  if (ready === live.length) return S.READY_FOR_ASSEMBLY;
  const inProd = live.some((t) => t.status === ProductionTaskStatus.IN_PRODUCTION);
  if (ready > 0) return S.PARTIALLY_READY;
  if (inProd) return S.IN_PRODUCTION;
  return S.SCHEDULED;
}

/**
 * Given the current order status and the rollup, returns the status to apply
 * or `null` when nothing should change (rollups are forward-only).
 */
export function nextStatusFromRollup(current: OrderStatus, rollup: OrderStatus): OrderStatus | null {
  const cur = PRODUCTION_RANK[current];
  const next = PRODUCTION_RANK[rollup];
  if (cur === undefined || next === undefined) return null;
  // PARTIALLY_READY → IN_PRODUCTION is allowed by the table but a rollup should not go backwards.
  if (next <= cur) return null;
  return canTransitionOrder(current, rollup) ? rollup : null;
}
