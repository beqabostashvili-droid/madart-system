import { describe, expect, it } from 'vitest';
import { OrderStatus as S, ProductionTaskStatus as T } from '../enums';
import { InvalidTransitionError } from '../errors';
import {
  assertOrderTransition,
  canTransitionOrder,
  isTerminalOrderStatus,
  nextStatusFromRollup,
  rollupOrderStatusFromTasks,
} from './order-state-machine';

describe('order state machine', () => {
  it('follows the happy path', () => {
    const path = [
      S.DRAFT,
      S.AWAITING_PAYMENT,
      S.PAID,
      S.CONFIRMED,
      S.SCHEDULED,
      S.IN_PRODUCTION,
      S.PARTIALLY_READY,
      S.READY_FOR_ASSEMBLY,
      S.READY_FOR_PICKUP,
      S.COMPLETED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionOrder(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it('rejects skipping payment', () => {
    expect(canTransitionOrder(S.AWAITING_PAYMENT, S.SCHEDULED)).toBe(false);
    expect(canTransitionOrder(S.DRAFT, S.PAID)).toBe(false);
    expect(() => assertOrderTransition(S.AWAITING_PAYMENT, S.IN_PRODUCTION)).toThrow(InvalidTransitionError);
  });

  it('allows cancellation before completion only', () => {
    expect(canTransitionOrder(S.READY_FOR_PICKUP, S.CANCELLED)).toBe(true);
    expect(canTransitionOrder(S.COMPLETED, S.CANCELLED)).toBe(false);
    expect(canTransitionOrder(S.CANCELLED, S.REFUNDED)).toBe(true);
  });

  it('knows terminal statuses', () => {
    expect(isTerminalOrderStatus(S.COMPLETED)).toBe(true);
    expect(isTerminalOrderStatus(S.REFUNDED)).toBe(true);
    expect(isTerminalOrderStatus(S.READY_FOR_PICKUP)).toBe(false);
  });
});

describe('rollup from tasks', () => {
  const t = (...s: (typeof T)[keyof typeof T][]) => s.map((status) => ({ status }));

  it('computes the implied status', () => {
    expect(rollupOrderStatusFromTasks(t(T.SCHEDULED, T.SCHEDULED))).toBe(S.SCHEDULED);
    expect(rollupOrderStatusFromTasks(t(T.IN_PRODUCTION, T.SCHEDULED))).toBe(S.IN_PRODUCTION);
    expect(rollupOrderStatusFromTasks(t(T.READY, T.SCHEDULED))).toBe(S.PARTIALLY_READY);
    expect(rollupOrderStatusFromTasks(t(T.READY, T.IN_PRODUCTION))).toBe(S.PARTIALLY_READY);
    expect(rollupOrderStatusFromTasks(t(T.READY, T.READY))).toBe(S.READY_FOR_ASSEMBLY);
    expect(rollupOrderStatusFromTasks(t(T.READY, T.CANCELLED))).toBe(S.READY_FOR_ASSEMBLY);
    expect(rollupOrderStatusFromTasks(t(T.CANCELLED))).toBe(S.READY_FOR_ASSEMBLY);
  });

  it('never demotes an order', () => {
    expect(nextStatusFromRollup(S.PARTIALLY_READY, S.IN_PRODUCTION)).toBeNull();
    expect(nextStatusFromRollup(S.IN_PRODUCTION, S.IN_PRODUCTION)).toBeNull();
    expect(nextStatusFromRollup(S.SCHEDULED, S.IN_PRODUCTION)).toBe(S.IN_PRODUCTION);
    expect(nextStatusFromRollup(S.SCHEDULED, S.READY_FOR_ASSEMBLY)).toBe(S.READY_FOR_ASSEMBLY);
    expect(nextStatusFromRollup(S.READY_FOR_PICKUP, S.READY_FOR_ASSEMBLY)).toBeNull();
  });
});
