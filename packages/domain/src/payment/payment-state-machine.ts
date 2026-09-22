import { PaymentRecordStatus, PaymentStatus } from '../enums';
import { InvalidTransitionError } from '../errors';

const P = PaymentRecordStatus;

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentRecordStatus, readonly PaymentRecordStatus[]>> = {
  [P.INITIATED]: [P.PENDING, P.SUCCEEDED, P.FAILED, P.CANCELLED],
  [P.PENDING]: [P.SUCCEEDED, P.FAILED, P.CANCELLED],
  [P.SUCCEEDED]: [P.PARTIALLY_REFUNDED, P.REFUNDED],
  [P.PARTIALLY_REFUNDED]: [P.PARTIALLY_REFUNDED, P.REFUNDED],
  [P.FAILED]: [],
  [P.CANCELLED]: [],
  [P.REFUNDED]: [],
};

export function canTransitionPayment(from: PaymentRecordStatus, to: PaymentRecordStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPaymentTransition(from: PaymentRecordStatus, to: PaymentRecordStatus): void {
  if (!canTransitionPayment(from, to)) throw new InvalidTransitionError('Payment', from, to);
}

export interface PaymentLike {
  status: PaymentRecordStatus;
  amount: number;
  refundedAmount: number;
  createdAt: Date | string;
}

/**
 * Derives the order-level payment status from its payment records
 * (docs/PAYMENTS.md). Cancelled payments are ignored.
 */
export function derivePaymentStatus(payments: readonly PaymentLike[]): PaymentStatus {
  const relevant = payments
    .filter((p) => p.status !== P.CANCELLED)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (relevant.length === 0) return PaymentStatus.UNPAID;

  const succeeded = relevant.filter(
    (p) => p.status === P.SUCCEEDED || p.status === P.PARTIALLY_REFUNDED || p.status === P.REFUNDED,
  );
  if (succeeded.length > 0) {
    const paid = succeeded.reduce((s, p) => s + p.amount, 0);
    const refunded = succeeded.reduce((s, p) => s + p.refundedAmount, 0);
    if (refunded === 0) return PaymentStatus.PAID;
    if (refunded >= paid) return PaymentStatus.REFUNDED;
    return PaymentStatus.PARTIALLY_REFUNDED;
  }

  const latest = relevant[relevant.length - 1]!;
  if (latest.status === P.FAILED) return PaymentStatus.FAILED;
  return PaymentStatus.PENDING;
}

/** Status a payment record should take after a refund of `amount`. */
export function paymentStatusAfterRefund(payment: PaymentLike, refundAmount: number): PaymentRecordStatus {
  const total = payment.refundedAmount + refundAmount;
  if (total > payment.amount) throw new RangeError('Refund exceeds paid amount');
  return total === payment.amount ? P.REFUNDED : P.PARTIALLY_REFUNDED;
}
