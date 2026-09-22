import { PaymentMethod, Permission } from '@madart/domain';
import {
  type CancelOrderBodyType,
  cancelOrderBody,
  type ConfirmCashBody,
  confirmCashBody,
  type CreateOrderBody,
  type CreateOrderResponse,
  createOrderBody,
  type InitiatePaymentBody,
  initiatePaymentBody,
  type OrdersQuery,
  ordersQuery,
  type PaymentCallbackBody,
  paymentCallbackBody,
  type PickupSlotsQuoteBody,
  pickupSlotsQuoteBody,
  type RefundBody,
  refundBody,
} from '@madart/types';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Actor } from '../auth/actor';
import { CurrentActor, Public, RequirePermissions } from '../auth/decorators';
import { zod } from '../common/validation/zod.pipe';
import { PaymentsService } from '../payments/payments.service';
import { OrderEngineService } from './order-engine.service';
import { PickupSlotsService } from './pickup-slots.service';

@Controller()
export class OrdersController {
  constructor(
    private readonly engine: OrderEngineService,
    private readonly payments: PaymentsService,
    private readonly slots: PickupSlotsService,
  ) {}

  /**
   * Create + submit. Public so the mobile PWA can order without an account;
   * kiosk/POS pass their device token and are branch-checked.
   */
  @Public()
  @Post('orders')
  async create(@Body(zod(createOrderBody)) body: CreateOrderBody, @CurrentActor() actor: Actor | undefined): Promise<CreateOrderResponse> {
    const effectiveActor: Actor = actor ?? customerActor(body.branchId);
    const { order, created } = await this.engine.createOrder(body, effectiveActor);
    let payment = null;
    if (body.paymentMethod !== PaymentMethod.CASH) {
      const existing = order.payments.find((p) => p.status !== 'CANCELLED');
      payment =
        created || !existing
          ? await this.payments.initiate(order.id, { method: body.paymentMethod, idempotencyKey: `${body.idempotencyKey}:pay` }, effectiveActor)
          : await this.payments.get(existing.id);
    }
    const view = await this.engine.getView(order.id, effectiveActor);
    return { order: view, payment, qrPayload: `MADART:${view.publicNumber}:${order.qrToken}` };
  }

  @Public()
  @Post('pickup-slots/quote')
  quote(@Body(zod(pickupSlotsQuoteBody)) body: PickupSlotsQuoteBody) {
    return this.slots.quote(body);
  }

  /** Customer-facing tracking by QR token (kiosk screen, mobile status page). */
  @Public()
  @Get('orders/track/:qrToken')
  track(@Param('qrToken', ParseUUIDPipe) qrToken: string) {
    return this.engine.track(qrToken);
  }

  @Get('orders')
  @RequirePermissions(Permission.ORDERS_READ)
  list(@Query(zod(ordersQuery)) q: OrdersQuery, @CurrentActor() actor: Actor) {
    return this.engine.list(q, actor);
  }

  @Get('orders/by-number/:publicNumber')
  @RequirePermissions(Permission.ORDERS_READ)
  byNumber(@Param('publicNumber') publicNumber: string, @Query('branchId', ParseUUIDPipe) branchId: string, @CurrentActor() actor: Actor) {
    return this.engine.getByNumber(branchId, publicNumber.trim().toUpperCase(), actor);
  }

  @Get('orders/by-qr/:qrToken')
  @RequirePermissions(Permission.ORDERS_READ)
  byQr(@Param('qrToken', ParseUUIDPipe) qrToken: string, @CurrentActor() actor: Actor) {
    return this.engine.getByQrToken(qrToken, actor);
  }

  @Get('orders/:id')
  @RequirePermissions(Permission.ORDERS_READ)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.engine.getView(id, actor);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions(Permission.ORDERS_CANCEL)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body(zod(cancelOrderBody)) body: CancelOrderBodyType, @CurrentActor() actor: Actor) {
    return this.engine.cancel(id, body.reason, actor);
  }

  // ───────────────────────────── payments ──────────────────────────────

  @Post('orders/:id/payments')
  @RequirePermissions(Permission.PAYMENTS_INITIATE_CARD)
  initiatePayment(@Param('id', ParseUUIDPipe) id: string, @Body(zod(initiatePaymentBody)) body: InitiatePaymentBody, @CurrentActor() actor: Actor) {
    return this.payments.initiate(id, body, actor);
  }

  @Post('orders/:id/payments/cash-confirm')
  @RequirePermissions(Permission.PAYMENTS_CONFIRM_CASH)
  confirmCash(@Param('id', ParseUUIDPipe) id: string, @Body(zod(confirmCashBody)) body: ConfirmCashBody, @CurrentActor() actor: Actor) {
    return this.payments.confirmCash(id, body, actor);
  }

  @Get('payments/:id')
  @RequirePermissions(Permission.PAYMENTS_READ)
  getPayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.get(id);
  }

  /** Provider → API. Public route; authenticity comes from the adapter's signature check. */
  @Public()
  @Post('payments/:id/callback')
  @HttpCode(200)
  callback(@Param('id', ParseUUIDPipe) id: string, @Body(zod(paymentCallbackBody)) body: PaymentCallbackBody) {
    return this.payments.callback(id, body);
  }

  @Post('payments/:id/reconcile')
  @RequirePermissions(Permission.PAYMENTS_READ)
  reconcile(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.payments.reconcile(id, actor);
  }

  @Post('payments/:id/refunds')
  @RequirePermissions(Permission.ORDERS_REFUND)
  refund(@Param('id', ParseUUIDPipe) id: string, @Body(zod(refundBody)) body: RefundBody, @CurrentActor() actor: Actor) {
    return this.payments.refund(id, body, actor);
  }
}

/** Anonymous mobile customer acting on a branch (no token). */
function customerActor(branchId: string): Actor {
  return { kind: 'device', id: 'customer', displayName: 'Customer', deviceType: 'KIOSK', branchId, stationId: null, permissions: [] } as Actor;
}
