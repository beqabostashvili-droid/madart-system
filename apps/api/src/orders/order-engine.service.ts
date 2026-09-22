import type { Prisma, TransactionClient } from '@madart/database';
import {
  assertOrderTransition,
  canTransitionOrder,
  computeAsapTargetReadyAt,
  isAvailableForSource,
  isCancellable,
  Locale,
  nextStatusFromRollup,
  OrderItemStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Permission,
  PickupType,
  pickTranslation,
  type PlannableItem,
  ProductionTaskStatus,
  resolveProductForBranch,
  rollupOrderStatusFromTasks,
  ValidationError,
} from '@madart/domain';
import type { CreateOrderBody, OrderSummaryView, OrderView, OrdersQuery, Paginated } from '@madart/types';
import { RealtimeEventType } from '@madart/types';
import { Injectable, Logger } from '@nestjs/common';
import { type Actor, assertBranchAccess, hasPermission, scopedBranchId } from '../auth/actor';
import { AuditService } from '../common/audit/audit.service';
import { Clock } from '../common/clock';
import { ForbiddenError, NotFoundError, StateConflictError } from '../common/errors/http-exception.filter';
import { type DomainEvent, EventBus, makeEvent } from '../common/events/event-bus';
import { logEvent } from '../common/logging/request-logger.interceptor';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { OrderNumberService } from './order-number.service';
import { orderInclude, type OrderRow, toOrderSummary, toOrderView } from './order-view.mapper';
import { ProductionPlannerService } from './production-planner.service';

export interface TransitionResult {
  order: OrderRow;
  events: DomainEvent[];
}

/**
 * The single Order Engine (spec §49). Every status change of every order –
 * whatever its source – goes through `transition()`, which is a conditional
 * UPDATE guarded by the expected current status, so concurrent writers can
 * never apply the same transition twice.
 */
@Injectable()
export class OrderEngineService {
  private readonly logger = new Logger(OrderEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly numbers: OrderNumberService,
    private readonly planner: ProductionPlannerService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly bus: EventBus,
  ) {}

  // ───────────────────────────── reads ─────────────────────────────────

  async loadOrThrow(id: string, tx?: TransactionClient): Promise<OrderRow> {
    const db = tx ?? this.prisma.client;
    const order = await db.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundError('Order', id);
    return order;
  }

  async getView(id: string, actor: Actor): Promise<OrderView> {
    const order = await this.loadOrThrow(id);
    assertBranchAccess(actor, order.branchId);
    return this.view(order);
  }

  async getByNumber(branchId: string, publicNumber: string, actor: Actor): Promise<OrderView> {
    assertBranchAccess(actor, branchId);
    const order = await this.prisma.client.order.findFirst({
      where: { branchId, publicNumber, status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED] } },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundError('Order', publicNumber);
    return this.view(order);
  }

  async getByQrToken(qrToken: string, actor: Actor): Promise<OrderView> {
    const order = await this.prisma.client.order.findUnique({ where: { qrToken }, include: orderInclude });
    if (!order) throw new NotFoundError('Order');
    assertBranchAccess(actor, order.branchId);
    return this.view(order);
  }

  /** Public tracking for kiosk/mobile customers – by the opaque QR token only. */
  async track(qrToken: string): Promise<OrderView> {
    const order = await this.prisma.client.order.findUnique({ where: { qrToken }, include: orderInclude });
    if (!order) throw new NotFoundError('Order');
    return this.view(order);
  }

  async list(q: OrdersQuery, actor: Actor): Promise<Paginated<OrderSummaryView>> {
    const branchId = scopedBranchId(actor, q.branchId ?? null);
    const statuses = q.status?.split(',').filter(Boolean) as OrderStatus[] | undefined;
    const where: Prisma.OrderWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(q.awaitingCash ? { status: OrderStatus.AWAITING_PAYMENT, paymentMethod: PaymentMethod.CASH } : {}),
      ...(q.search ? { OR: [{ publicNumber: { contains: q.search.toUpperCase() } }, { customerName: { contains: q.search, mode: 'insensitive' } }, { customerPhone: { contains: q.search } }] } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.order.findMany({ where, include: { items: { select: { quantity: true } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.client.order.count({ where }),
    ]);
    return { items: rows.map((r) => toOrderSummary(r as never)), total, limit: q.limit, offset: q.offset };
  }

  async view(order: OrderRow): Promise<OrderView> {
    const thresholds = await this.settings.productionThresholds(order.branchId);
    return toOrderView(order, this.clock.now(), thresholds);
  }

  // ───────────────────────────── create ────────────────────────────────

  /**
   * Creates and submits an order: DRAFT → AWAITING_PAYMENT in one transaction.
   * Idempotent on `idempotencyKey` (a replay returns the existing order).
   */
  async createOrder(body: CreateOrderBody, actor: Actor): Promise<{ order: OrderRow; created: boolean }> {
    assertBranchAccess(actor, body.branchId);
    if (actor.kind === 'device' && actor.deviceType === 'KIOSK' && body.source !== 'KIOSK') throw new ForbiddenError('Kiosk devices create KIOSK orders only');
    if (actor.kind === 'device' && actor.deviceType === 'POS' && body.source !== 'POS') throw new ForbiddenError('POS devices create POS orders only');

    const existing = await this.prisma.client.order.findUnique({ where: { idempotencyKey: body.idempotencyKey }, include: orderInclude });
    if (existing) return { order: existing, created: false };

    const now = this.clock.now();
    const branch = await this.prisma.client.branch.findUnique({ where: { id: body.branchId } });
    if (!branch || !branch.active) throw new NotFoundError('Branch', body.branchId);

    const productIds = [...new Set(body.items.map((i) => i.productId))];
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: productIds } },
      include: {
        translations: true,
        productionConfig: true,
        branches: { where: { branchId: body.branchId } },
        modifierGroups: { include: { modifiers: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const itemRows: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    const plannable: PlannableItem[] = [];

    body.items.forEach((input, index) => {
      const product = byId.get(input.productId);
      if (!product || product.archivedAt) throw new ValidationError(`Product ${input.productId} not found`);
      const override = product.branches[0] ?? null;
      const resolved = resolveProductForBranch(product, override);
      if (!isAvailableForSource(resolved, body.source)) throw new ValidationError(`Product ${product.sku} is not available for ${body.source}`);

      const allModifiers = product.modifierGroups.flatMap((g) => g.modifiers);
      const chosen = input.modifierIds.map((id) => {
        const m = allModifiers.find((x) => x.id === id && x.active);
        if (!m) throw new ValidationError(`Modifier ${id} not valid for ${product.sku}`);
        return m;
      });
      const modifierDelta = chosen.reduce((s, m) => s + m.priceDelta, 0);
      const unitPrice = resolved.price + modifierDelta;
      const lineTotal = unitPrice * input.quantity;
      subtotal += lineTotal;

      const cfg = product.productionConfig;
      const productionRequired = cfg?.productionRequired ?? false;
      const stationId = override?.stationOverrideId ?? cfg?.stationId ?? null;
      if (productionRequired && !stationId) throw new ValidationError(`Product ${product.sku} requires production but has no station configured`);
      const t = pickTranslation(product.translations.map((x) => ({ ...x, locale: x.locale as Locale })), Locale.ka);

      itemRows.push({
        product: { connect: { id: product.id } },
        nameSnapshot: t?.name ?? product.sku,
        unitPrice,
        quantity: input.quantity,
        lineTotal,
        productionRequired,
        stationIdSnapshot: productionRequired ? stationId : null,
        productionTimeSnapshot: productionRequired ? (cfg?.productionTimeMinutes ?? 0) : 0,
        bufferSnapshot: productionRequired ? (cfg?.preparationBufferMinutes ?? 0) : 0,
        capacityUnitsSnapshot: cfg?.capacityUnits ?? 1,
        prioritySnapshot: cfg?.priority ?? 0,
        note: input.note ?? null,
        sortOrder: index,
        status: OrderItemStatus.PENDING,
        modifiers: { create: chosen.map((m) => ({ modifierId: m.id, nameSnapshot: m.nameKa, priceDelta: m.priceDelta })) },
      });
      plannable.push({
        itemId: String(index),
        productionRequired,
        stationId,
        productionTimeMinutes: cfg?.productionTimeMinutes ?? 0,
        preparationBufferMinutes: cfg?.preparationBufferMinutes ?? 0,
        capacityUnits: cfg?.capacityUnits ?? 1,
        quantity: input.quantity,
        priority: cfg?.priority ?? 0,
      });
    });

    let targetReadyAt: Date;
    if (body.pickupType === PickupType.SCHEDULED) {
      if (!body.pickupAt) throw new ValidationError('pickupAt is required for scheduled pickup');
      targetReadyAt = new Date(body.pickupAt);
      if (targetReadyAt.getTime() < now.getTime()) throw new ValidationError('pickupAt is in the past');
    } else {
      targetReadyAt = computeAsapTargetReadyAt(plannable, now);
    }

    const padding = await this.settings.get('orders.numberPadding', branch.id);
    const order = await this.prisma.tx(async (tx) => {
      const { publicNumber, businessDate } = await this.numbers.allocate(tx, branch, now, padding);
      const created = await tx.order.create({
        data: {
          branchId: branch.id,
          publicNumber,
          businessDate,
          source: body.source,
          status: OrderStatus.AWAITING_PAYMENT,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: body.paymentMethod,
          pickupType: body.pickupType,
          targetReadyAt,
          subtotal,
          discountTotal: 0,
          total: subtotal,
          customerName: body.customerName ?? null,
          customerPhone: body.customerPhone ?? null,
          note: body.note ?? null,
          deviceId: actor.kind === 'device' ? actor.id : null,
          createdByUserId: actor.kind === 'user' ? actor.id : null,
          idempotencyKey: body.idempotencyKey,
          items: { create: itemRows },
          history: {
            create: [
              { fromStatus: null, toStatus: OrderStatus.DRAFT, actorType: actorType(actor), actorId: actor.id, at: now },
              { fromStatus: OrderStatus.DRAFT, toStatus: OrderStatus.AWAITING_PAYMENT, actorType: actorType(actor), actorId: actor.id, at: now },
            ],
          },
        },
        include: orderInclude,
      });
      return created;
    });

    logEvent(this.logger, 'order created', { order_id: order.id, public_order_number: order.publicNumber, branch_id: order.branchId, source: order.source, total: order.total });
    await this.bus.publish(makeEvent(RealtimeEventType.ORDER_CREATED, order.branchId, toOrderSummary(order), { orderId: order.id }, now));
    return { order, created: true };
  }

  // ───────────────────────────── transitions ───────────────────────────

  /**
   * Conditional transition inside `tx`. Throws StateConflictError when the
   * order is no longer in `from`. Appends history and returns the events to
   * publish after commit.
   */
  async transition(
    tx: TransactionClient,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    actor: Actor | null,
    reason: string | null = null,
    extra: Prisma.OrderUpdateManyMutationInput = {},
  ): Promise<DomainEvent[]> {
    assertOrderTransition(from, to);
    const now = this.clock.now();
    const stamps: Prisma.OrderUpdateManyMutationInput = {};
    if (to === OrderStatus.PAID) stamps.paidAt = now;
    if (to === OrderStatus.CONFIRMED) stamps.confirmedAt = now;
    if (to === OrderStatus.READY_FOR_PICKUP) stamps.readyForPickupAt = now;
    if (to === OrderStatus.COMPLETED) stamps.completedAt = now;
    if (to === OrderStatus.CANCELLED) {
      stamps.cancelledAt = now;
      stamps.cancelReason = reason;
    }

    const res = await tx.order.updateMany({
      where: { id: orderId, status: from },
      data: { status: to, version: { increment: 1 }, ...stamps, ...extra },
    });
    if (res.count !== 1) {
      const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
      throw new StateConflictError(`Order is ${current?.status ?? 'missing'}, expected ${from}`, current);
    }
    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: from, toStatus: to, actorType: actorType(actor), actorId: actor?.id ?? null, reason, at: now },
    });
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { branchId: true, publicNumber: true } });
    logEvent(this.logger, 'order transition', { order_id: orderId, public_order_number: order.publicNumber, branch_id: order.branchId, from, to });

    const events: DomainEvent[] = [
      makeEvent(RealtimeEventType.ORDER_STATUS_CHANGED, order.branchId, { orderId, publicNumber: order.publicNumber, from, to }, { orderId }, now),
    ];
    if (to === OrderStatus.READY_FOR_PICKUP) events.push(makeEvent(RealtimeEventType.ORDER_READY_FOR_PICKUP, order.branchId, { orderId, publicNumber: order.publicNumber }, { orderId }, now));
    if (to === OrderStatus.COMPLETED) events.push(makeEvent(RealtimeEventType.ORDER_COMPLETED, order.branchId, { orderId, publicNumber: order.publicNumber }, { orderId }, now));
    if (to === OrderStatus.CANCELLED) events.push(makeEvent(RealtimeEventType.ORDER_CANCELLED, order.branchId, { orderId, publicNumber: order.publicNumber, reason }, { orderId }, now));
    return events;
  }

  /**
   * Called by PaymentsService inside its transaction once a payment SUCCEEDED:
   * AWAITING_PAYMENT → PAID → CONFIRMED → (SCHEDULED | READY_FOR_ASSEMBLY),
   * production tasks created (spec §48, ASSUMPTION A-05).
   */
  async onPaymentSucceeded(tx: TransactionClient, orderId: string, actor: Actor | null): Promise<DomainEvent[]> {
    const now = this.clock.now();
    const events: DomainEvent[] = [];
    events.push(...(await this.transition(tx, orderId, OrderStatus.AWAITING_PAYMENT, OrderStatus.PAID, actor, null, { paymentStatus: PaymentStatus.PAID })));
    events.push(...(await this.transition(tx, orderId, OrderStatus.PAID, OrderStatus.CONFIRMED, null)));

    const plan = await this.planner.plan(tx, orderId, now, actor);
    const next = plan.taskIds.length > 0 ? OrderStatus.SCHEDULED : OrderStatus.READY_FOR_ASSEMBLY;
    events.push(...(await this.transition(tx, orderId, OrderStatus.CONFIRMED, next, null)));

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    const summary = toOrderSummary(order);
    events.push(makeEvent(RealtimeEventType.ORDER_CONFIRMED, order.branchId, summary, { orderId }, now));
    for (const task of order.tasks) {
      events.push(
        makeEvent(
          RealtimeEventType.PRODUCTION_TASK_CREATED,
          order.branchId,
          (await this.taskViewFor(task, order)),
          { stationId: task.stationId, orderId },
          now,
        ),
      );
    }
    if (next === OrderStatus.READY_FOR_ASSEMBLY) events.push(makeEvent(RealtimeEventType.ORDER_READY_FOR_ASSEMBLY, order.branchId, summary, { orderId }, now));
    return events;
  }

  /** Recomputes the order status from its tasks (forward-only). */
  async rollupFromTasks(tx: TransactionClient, orderId: string, actor: Actor | null): Promise<DomainEvent[]> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { tasks: { select: { status: true } } } });
    const rollup = rollupOrderStatusFromTasks(order.tasks);
    const next = nextStatusFromRollup(order.status, rollup);
    if (!next) return [];
    const events = await this.transition(tx, orderId, order.status, next, actor);
    if (next === OrderStatus.READY_FOR_ASSEMBLY) {
      const full = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
      events.push(makeEvent(RealtimeEventType.ORDER_READY_FOR_ASSEMBLY, full.branchId, toOrderSummary(full), { orderId }, this.clock.now()));
    }
    return events;
  }

  // ───────────────────────────── cancellation (A-15) ───────────────────

  async cancel(orderId: string, reason: string, actor: Actor): Promise<OrderView> {
    const order = await this.loadOrThrow(orderId);
    assertBranchAccess(actor, order.branchId);
    if (!isCancellable(order.status)) throw new StateConflictError(`Order in status ${order.status} cannot be cancelled`, { status: order.status });
    if (!hasPermission(actor, Permission.ORDERS_CANCEL)) throw new ForbiddenError('Missing permission: orders.cancel');
    const paid = order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED;
    if (paid && !hasPermission(actor, Permission.ORDERS_REFUND)) throw new ForbiddenError('Cancelling a paid order requires orders.refund');

    const productionStarted = order.tasks.some((t) => t.status === ProductionTaskStatus.IN_PRODUCTION || t.status === ProductionTaskStatus.READY);
    const events = await this.prisma.tx(async (tx) => {
      const ev = await this.transition(tx, orderId, order.status, OrderStatus.CANCELLED, actor, reason);
      await tx.productionTask.updateMany({
        where: { orderId, status: { in: [ProductionTaskStatus.SCHEDULED, ProductionTaskStatus.IN_PRODUCTION] } },
        data: { status: ProductionTaskStatus.CANCELLED, version: { increment: 1 } },
      });
      await tx.orderItem.updateMany({ where: { orderId, status: { not: OrderItemStatus.READY } }, data: { status: OrderItemStatus.CANCELLED } });
      // Pending card payments are cancelled; succeeded ones are left for an explicit refund.
      await tx.payment.updateMany({ where: { orderId, status: { in: ['INITIATED', 'PENDING'] } }, data: { status: 'CANCELLED' } });
      await this.audit.record(actor, { action: 'CANCEL', entityType: 'Order', entityId: orderId, orderId, branchId: order.branchId, metadata: { reason, paid, productionStarted } }, tx);
      for (const t of order.tasks.filter((x) => x.status === ProductionTaskStatus.SCHEDULED || x.status === ProductionTaskStatus.IN_PRODUCTION)) {
        ev.push(makeEvent(RealtimeEventType.PRODUCTION_TASK_CANCELLED, order.branchId, await this.taskViewFor({ ...t, status: ProductionTaskStatus.CANCELLED }, order), { stationId: t.stationId, orderId }, this.clock.now()));
      }
      return ev;
    });
    await this.bus.publishAll(events);
    return this.getView(orderId, actor);
  }

  /** Marks a cancelled + fully refunded order as REFUNDED (called by PaymentsService). */
  async markRefundedIfSettled(tx: TransactionClient, orderId: string, actor: Actor | null): Promise<DomainEvent[]> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
    if (order.status !== OrderStatus.CANCELLED || !canTransitionOrder(order.status, OrderStatus.REFUNDED)) return [];
    return this.transition(tx, orderId, OrderStatus.CANCELLED, OrderStatus.REFUNDED, actor, null, { paymentStatus: PaymentStatus.REFUNDED });
  }

  // ───────────────────────────── helpers ───────────────────────────────

  async taskViewFor(task: OrderRow['tasks'][number], order: { publicNumber: string; targetReadyAt: Date; source: OrderRow['source']; branchId: string }) {
    const { toTaskView } = await import('./order-view.mapper');
    const thresholds = await this.settings.productionThresholds(order.branchId);
    return toTaskView(task, order, this.clock.now(), thresholds);
  }
}

export function actorType(actor: Actor | null): 'USER' | 'DEVICE' | 'SYSTEM' {
  if (!actor) return 'SYSTEM';
  return actor.kind === 'user' ? 'USER' : 'DEVICE';
}
