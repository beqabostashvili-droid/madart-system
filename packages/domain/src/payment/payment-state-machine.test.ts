import { describe, expect, it } from 'vitest';
import { PaymentRecordStatus as P, PaymentStatus } from '../enums';
import { canTransitionPayment, derivePaymentStatus, paymentStatusAfterRefund } from './payment-state-machine';

const pay = (status: P, amount = 1000, refundedAmount = 0, createdAt = '2026-09-22T10:00:00Z') => ({
  status,
  amount,
  refundedAmount,
  createdAt,
});

describe('payment record transitions', () => {
  it('cannot succeed twice', () => {
    expect(canTransitionPayment(P.SUCCEEDED, P.SUCCEEDED)).toBe(false);
    expect(canTransitionPayment(P.FAILED, P.SUCCEEDED)).toBe(false);
    expect(canTransitionPayment(P.PENDING, P.SUCCEEDED)).toBe(true);
  });
});

describe('derivePaymentStatus', () => {
  it('is UNPAID without payments', () => {
    expect(derivePaymentStatus([])).toBe(PaymentStatus.UNPAID);
    expect(derivePaymentStatus([pay(P.CANCELLED)])).toBe(PaymentStatus.UNPAID);
  });
  it('is PENDING while the latest is in flight', () => {
    expect(derivePaymentStatus([pay(P.PENDING)])).toBe(PaymentStatus.PENDING);
  });
  it('is FAILED when the latest attempt failed', () => {
    expect(derivePaymentStatus([pay(P.FAILED)])).toBe(PaymentStatus.FAILED);
  });
  it('a later retry after failure that succeeds is PAID', () => {
    expect(derivePaymentStatus([pay(P.FAILED), pay(P.SUCCEEDED, 1000, 0, '2026-09-22T10:01:00Z')])).toBe(PaymentStatus.PAID);
  });
  it('refunds', () => {
    expect(derivePaymentStatus([pay(P.PARTIALLY_REFUNDED, 1000, 300)])).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(derivePaymentStatus([pay(P.REFUNDED, 1000, 1000)])).toBe(PaymentStatus.REFUNDED);
  });
});

describe('paymentStatusAfterRefund', () => {
  it('partial then full', () => {
    expect(paymentStatusAfterRefund(pay(P.SUCCEEDED, 1000), 400)).toBe(P.PARTIALLY_REFUNDED);
    expect(paymentStatusAfterRefund(pay(P.PARTIALLY_REFUNDED, 1000, 400), 600)).toBe(P.REFUNDED);
    expect(() => paymentStatusAfterRefund(pay(P.SUCCEEDED, 1000), 1001)).toThrow(RangeError);
  });
});
