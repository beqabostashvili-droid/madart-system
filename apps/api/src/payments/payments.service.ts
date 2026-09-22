import type { TransactionClient } from '@madart/database';
import {
  assertPaymentTransition,
  derivePaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentRecordStatus,
  paymentStatusAfterRefund,
  ValidationError,
} from '@madart/domain';
import type { PaymentTerminalAdapter, TerminalResult } from '@madart/hardware-adapters';
import { MockPaymentTerminalAdapter, TerminalUnavailableError } from '@madart/hardware-adapters';
import { type ConfirmCashBody, type InitiatePaymentBody, type PaymentCallbackBody, type PaymentView, RealtimeEventType, type RefundBody } from '@madart/types';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Actor, assertBranchAccess } from '../auth/actor';
import { AuditService } from '../common/audit/audit.service';
import { Clock } from '../common/clock';
import { NotFoundError, StateConflictError } from '../common/errors/http-exception.filter';
import { type DomainEvent, EventBus, makeEvent } from '../common/events/event-bus';
import { logEvent } from '../common/logging/request-logger.interceptor';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { getEnv } from '../config/env';
import { actorType, OrderEngineService } from '../orders/order-engine.service';
import { toPaymentView } from '../orders/order-view.mapper';

/**
 * Payment orchestration (docs/PAYMENTS.md). The provider adapter is the only
 * thing that changes when a real bank terminal arrives.
 */
@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly env = getEnv();
  terminal: PaymentTerminalAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly engine: OrderEngineService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly bus: EventBus,
  ) {
    this.terminal = new MockPaymentTerminalAdapter({
      delayMs: this.env.MOCK_TERMINAL_DELAY_MS,
      deliverCallback: (paymentId, result) =>
        this.handleProviderResult(paymentId, result, 'terminal-bridge').catch((err) =>
          this.logger.error(`mock callback failed for ${paymentId}: ${(err as Error).message}`),
        ),
    });
  }

  onModuleInit() {
    this.logger.log(`payment terminal provider: ${this.terminal.provider}`);
  }

  // ───────────────────────────── card / online ─────────────────────────

  async initiate(orderId: string, body: InitiatePaymentBody, actor: Actor): Promise<PaymentView> {
    const order = await this.engine.loadOrThrow(orderId);
    assertBranchAccess(actor, order.branchId);
    if (order.status !== OrderStatus.AWAITING_PAYMENT) throw new StateConflictError(`Order is ${order.status}`, { status: order.status });

    const replay = await this.prisma.client.payment.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
    if (replay) return toPaymentView(replay);

    const inFlight = order.payments.find((p) => p.status === PaymentRecordStatus.INITIATED || p.status === PaymentRecordStatus.PENDING);
    if (inFlight) throw new StateConflictError('A payment is already in progress', toPaymentView(inFlight));

    const now = this.clock.now();
    const payment = await this.prisma.tx(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId,
          method: body.method,
          provider: body.method === PaymentMethod.ONLINE ? 'MOCK_ONLINE' : this.terminal.provider,
          status: PaymentRecordStatus.INITIATED,
          amount: order.total,
          idempotencyKey: body.idempotencyKey,
          terminalId: body.terminalId ?? null,
          history: { create: [{ fromStatus: null, toStatus: PaymentRecordStatus.INITIATED, actorType: actorType(actor), actorId: actor.id, at: now }] },
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PENDING', paymentMethod: body.method } });
      return created;
    });

    try {
      const init = await this.terminal.initiate({
        paymentId: payment.id,
        orderId,
        publicNumber: order.publicNumber,
        amount: order.total,
        currency: order.currency,
        terminalId: body.terminalId,
        callbackUrl: `${this.env.API_PUBLIC_URL}/api/v1/payments/${payment.id}/callback`,
        idempotencyKey: body.idempotencyKey,
      });
      await this.prisma.client.payment.updateMany({
        where: { id: payment.id, status: PaymentRecordStatus.INITIATED },
        data: { status: PaymentRecordStatus.PENDING, providerReference: init.providerReference },
      });
      await this.prisma.client.paymentStatusHistory.create({
        data: { paymentId: payment.id, fromStatus: PaymentRecordStatus.INITIATED, toStatus: PaymentRecordStatus.PENDING, actorType: 'SYSTEM', note: init.providerReference },
      });
      logEvent(this.logger, 'payment initiated', { payment_id: payment.id, order_id: orderId, public_order_number: order.publicNumber, branch_id: order.branchId, provider: this.terminal.provider });
      if (init.immediate) await this.handleProviderResult(payment.id, init.immediate, 'immediate');
    } catch (err) {
      const code = err instanceof TerminalUnavailableError ? err.code : 'INITIATE_FAILED';
      await this.failPayment(payment.id, code, actor, (err as Error).message);
    }
    return this.get(payment.id);
  }

  /** HTTP callback from a terminal bridge / provider webhook. */
  async callback(paymentId: string, body: PaymentCallbackBody): Promise<PaymentView> {
    if (!this.terminal.verifyCallback(body.rawPayload ?? {}, body.signature)) throw new ValidationError('Invalid callback signature');
    await this.handleProviderResult(
      paymentId,
      { providerReference: body.providerReference, result: body.result, failureCode: body.failureCode, maskedPan: body.maskedPan, authCode: body.authCode, raw: body.rawPayload },
      'callback',
    );
    return this.get(paymentId);
  }

  /**
   * Single settlement path for every provider result. Duplicate callbacks are
   * absorbed by the conditional update (`status IN (INITIATED, PENDING)`).
   */
  async handleProviderResult(paymentId: string, result: TerminalResult, source: string): Promise<void> {
    const now = this.clock.now();
    const events: DomainEvent[] = [];

    await this.prisma.tx(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
      if (!payment) throw new NotFoundError('Payment', paymentId);
      if (payment.providerReference && payment.providerReference !== result.providerReference) {
        this.logger.warn(JSON.stringify({ msg: 'callback reference mismatch', payment_id: paymentId, expected: payment.providerReference, got: result.providerReference }));
        return;
      }

      const target =
        result.result === 'SUCCEEDED' ? PaymentRecordStatus.SUCCEEDED : result.result === 'CANCELLED' ? PaymentRecordStatus.CANCELLED : PaymentRecordStatus.FAILED;
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: [PaymentRecordStatus.INITIATED, PaymentRecordStatus.PENDING] } },
        data: {
          status: target,
          providerReference: result.providerReference,
          maskedPan: result.maskedPan ?? null,
          authCode: result.authCode ?? null,
          failureCode: target === PaymentRecordStatus.FAILED ? (result.failureCode ?? 'FAILED') : null,
          rawProviderPayload: (result.raw ?? undefined) as object | undefined,
          capturedAt: target === PaymentRecordStatus.SUCCEEDED ? now : null,
          failedAt: target === PaymentRecordStatus.FAILED ? now : null,
        },
      });
      if (res.count !== 1) {
        logEvent(this.logger, 'duplicate payment result ignored', { payment_id: paymentId, source, current: payment.status });
        return;
      }
      await tx.paymentStatusHistory.create({
        data: { paymentId, fromStatus: payment.status, toStatus: target, actorType: 'SYSTEM', note: `${source}:${result.providerReference}` },
      });

      const order = payment.order;
      if (target === PaymentRecordStatus.SUCCEEDED) {
        if (order.status === OrderStatus.AWAITING_PAYMENT) {
          events.push(...(await this.engine.onPaymentSucceeded(tx, order.id, null)));
        } else {
          // Money captured for an order that moved on (e.g. cancelled meanwhile) – never lose it silently.
          await this.audit.record(null, { action: 'PAYMENT_FOR_INACTIVE_ORDER', entityType: 'Payment', entityId: paymentId, orderId: order.id, branchId: order.branchId, metadata: { orderStatus: order.status } }, tx);
          await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } });
        }
        events.push(makeEvent(RealtimeEventType.PAYMENT_COMPLETED, order.branchId, { orderId: order.id, paymentId, method: payment.method, publicNumber: order.publicNumber }, { orderId: order.id }, now));
      } else {
        const all = await tx.payment.findMany({ where: { orderId: order.id } });
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: derivePaymentStatus(all) } });
        events.push(makeEvent(RealtimeEventType.PAYMENT_FAILED, order.branchId, { orderId: order.id, paymentId, failureCode: result.failureCode ?? null, publicNumber: order.publicNumber }, { orderId: order.id }, now));
      }
      logEvent(this.logger, 'payment settled', { payment_id: paymentId, order_id: order.id, public_order_number: order.publicNumber, branch_id: order.branchId, result: target, source });
    });

    await this.bus.publishAll(events);
  }

  private async failPayment(paymentId: string, failureCode: string, actor: Actor | null, note: string) {
    const now = this.clock.now();
    const events: DomainEvent[] = [];
    await this.prisma.tx(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: [PaymentRecordStatus.INITIATED, PaymentRecordStatus.PENDING] } },
        data: { status: PaymentRecordStatus.FAILED, failureCode, failedAt: now },
      });
      if (res.count !== 1) return;
      await tx.paymentStatusHistory.create({ data: { paymentId, fromStatus: payment.status, toStatus: PaymentRecordStatus.FAILED, actorType: actorType(actor), actorId: actor?.id ?? null, note } });
      const all = await tx.payment.findMany({ where: { orderId: payment.orderId } });
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: derivePaymentStatus(all) } });
      events.push(makeEvent(RealtimeEventType.PAYMENT_FAILED, payment.order.branchId, { orderId: payment.orderId, paymentId, failureCode, publicNumber: payment.order.publicNumber }, { orderId: payment.orderId }, now));
      this.logger.error(JSON.stringify({ msg: 'payment failed', payment_id: paymentId, order_id: payment.orderId, failureCode, note }));
    });
    await this.bus.publishAll(events);
  }

  // ───────────────────────────── cash ──────────────────────────────────

  /** Cashier confirms cash received (kiosk cash order or POS cash order). */
  async confirmCash(orderId: string, body: ConfirmCashBody, actor: Actor): Promise<PaymentView> {
    const order = await this.engine.loadOrThrow(orderId);
    assertBranchAccess(actor, order.branchId);

    const replay = await this.prisma.client.payment.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
    if (replay) return toPaymentView(replay);
    if (order.status !== OrderStatus.AWAITING_PAYMENT) throw new StateConflictError(`Order is ${order.status}`, { status: order.status });
    if (body.amountReceived < order.total) throw new ValidationError(`Amount received ${body.amountReceived} is less than total ${order.total}`);

    const now = this.clock.now();
    const events: DomainEvent[] = [];
    const paymentId = await this.prisma.tx(async (tx) => {
      // Any in-flight card attempt is superseded by cash.
      await tx.payment.updateMany({ where: { orderId, status: { in: [PaymentRecordStatus.INITIATED, PaymentRecordStatus.PENDING] } }, data: { status: PaymentRecordStatus.CANCELLED } });
      const payment = await tx.payment.create({
        data: {
          orderId,
          method: PaymentMethod.CASH,
          provider: 'CASH',
          status: PaymentRecordStatus.SUCCEEDED,
          amount: order.total,
          idempotencyKey: body.idempotencyKey,
          confirmedByUserId: actor.kind === 'user' ? actor.id : null,
          capturedAt: now,
          rawProviderPayload: { amountReceived: body.amountReceived, change: body.amountReceived - order.total },
          history: { create: [{ fromStatus: null, toStatus: PaymentRecordStatus.SUCCEEDED, actorType: actorType(actor), actorId: actor.id, at: now }] },
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { paymentMethod: PaymentMethod.CASH } });
      events.push(...(await this.engine.onPaymentSucceeded(tx, orderId, actor)));
      events.push(makeEvent(RealtimeEventType.PAYMENT_COMPLETED, order.branchId, { orderId, paymentId: payment.id, method: PaymentMethod.CASH, publicNumber: order.publicNumber }, { orderId }, now));
      await this.audit.record(actor, { action: 'CASH_PAYMENT_CONFIRMED', entityType: 'Payment', entityId: payment.id, orderId, branchId: order.branchId, metadata: { amountReceived: body.amountReceived, total: order.total } }, tx);
      return payment.id;
    });
    logEvent(this.logger, 'cash confirmed', { payment_id: paymentId, order_id: orderId, public_order_number: order.publicNumber, branch_id: order.branchId });
    await this.bus.publishAll(events);
    return this.get(paymentId);
  }

  // ───────────────────────────── reconcile / refund ────────────────────

  async get(paymentId: string): Promise<PaymentView> {
    const p = await this.prisma.client.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundError('Payment', paymentId);
    return toPaymentView(p);
  }

  /** Asks the provider for the authoritative status of a pending payment. */
  async reconcile(paymentId: string, actor: Actor | null): Promise<PaymentView> {
    const p = await this.prisma.client.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundError('Payment', paymentId);
    if (p.status !== PaymentRecordStatus.PENDING && p.status !== PaymentRecordStatus.INITIATED) return toPaymentView(p);
    if (!p.providerReference) {
      await this.failPayment(paymentId, 'NO_PROVIDER_REFERENCE', actor, 'reconcile');
      return this.get(paymentId);
    }
    const status = await this.terminal.queryStatus(p.providerReference);
    if (status.result === 'PENDING') {
      const timeout = await this.settings.get('payments.timeoutSeconds');
      if (this.clock.now().getTime() - p.createdAt.getTime() > timeout * 1000) {
        await this.terminal.cancel(p.providerReference).catch(() => undefined);
        await this.failPayment(paymentId, 'TIMEOUT', actor, 'reconcile timeout');
      }
      return this.get(paymentId);
    }
    await this.handleProviderResult(paymentId, status, 'reconcile');
    return this.get(paymentId);
  }

  async refund(paymentId: string, body: RefundBody, actor: Actor): Promise<PaymentView> {
    const payment = await this.prisma.client.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment) throw new NotFoundError('Payment', paymentId);
    assertBranchAccess(actor, payment.order.branchId);
    const replay = await this.prisma.client.refund.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
    if (replay) return this.get(paymentId);

    const nextStatus = paymentStatusAfterRefund(payment, body.amount);
    assertPaymentTransition(payment.status, nextStatus);

    let providerRef: string | null = null;
    if (payment.method !== PaymentMethod.CASH && payment.providerReference) {
      const r = await this.terminal.refund(payment.providerReference, body.amount, body.idempotencyKey);
      if (r.result !== 'SUCCEEDED') throw new StateConflictError(`Provider refused refund: ${r.failureCode ?? 'unknown'}`);
      providerRef = r.providerReference;
    }

    const now = this.clock.now();
    const events: DomainEvent[] = [];
    await this.prisma.tx(async (tx) => {
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: payment.status, refundedAmount: payment.refundedAmount },
        data: { status: nextStatus, refundedAmount: { increment: body.amount } },
      });
      if (res.count !== 1) throw new StateConflictError('Payment changed concurrently');
      await tx.refund.create({
        data: { paymentId, amount: body.amount, reason: body.reason, status: 'SUCCEEDED', providerReference: providerRef, idempotencyKey: body.idempotencyKey, createdByUserId: actor.kind === 'user' ? actor.id : null, settledAt: now },
      });
      await tx.paymentStatusHistory.create({ data: { paymentId, fromStatus: payment.status, toStatus: nextStatus, actorType: actorType(actor), actorId: actor.id, note: body.reason } });
      const all = await tx.payment.findMany({ where: { orderId: payment.orderId } });
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: derivePaymentStatus(all) } });
      await this.audit.record(actor, { action: 'REFUND', entityType: 'Payment', entityId: paymentId, orderId: payment.orderId, branchId: payment.order.branchId, metadata: { amount: body.amount, reason: body.reason } }, tx);
      if (derivePaymentStatus(all) === 'REFUNDED') events.push(...(await this.engine.markRefundedIfSettled(tx, payment.orderId, actor)));
    });
    await this.bus.publishAll(events);
    return this.get(paymentId);
  }

  async terminalHealth() {
    return this.terminal.health();
  }

  /** Test/ops helper so the mock can be swapped. */
  useTerminal(adapter: PaymentTerminalAdapter) {
    this.terminal = adapter;
  }

  async assertPaymentsForOrder(_tx: TransactionClient, _orderId: string) {
    /* reserved for reconciliation jobs */
  }
}
