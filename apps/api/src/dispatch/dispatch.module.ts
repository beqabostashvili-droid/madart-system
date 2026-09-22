import { OrderItemStatus, OrderStatus, Permission, ProductionTaskStatus, ValidationError } from '@madart/domain';
import { type DispatchBoardView, type DispatchGroupView, type DispatchOrderView, RealtimeEventType } from '@madart/types';
import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { type Actor, assertBranchAccess, hasPermission, scopedBranchId } from '../auth/actor';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { Clock } from '../common/clock';
import { ForbiddenError, StateConflictError } from '../common/errors/http-exception.filter';
import { type DomainEvent, EventBus, makeEvent } from '../common/events/event-bus';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { OrderEngineService } from '../orders/order-engine.service';
import { OrdersModule } from '../orders/orders.module';
import { orderInclude, type OrderRow, toItemView, toOrderSummary, toTaskView } from '../orders/order-view.mapper';

const PREPARING: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.SCHEDULED, OrderStatus.IN_PRODUCTION, OrderStatus.PARTIALLY_READY];

/** Order assembly (spec §17–18, ASSUMPTION A-20). */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly engine: OrderEngineService,
    private readonly audit: AuditService,
    private readonly bus: EventBus,
  ) {}

  private toDispatchOrder(o: OrderRow, now: Date, thresholds: Awaited<ReturnType<SettingsService['productionThresholds']>>): DispatchOrderView {
    const items = o.items.map(toItemView);
    const tasks = o.tasks.map((t) => toTaskView(t, o, now, thresholds));
    const stationIds = [...new Set(o.items.map((i) => i.stationIdSnapshot))];
    const groups: DispatchGroupView[] = stationIds.map((stationId) => {
      const gItems = items.filter((i) => i.stationId === stationId);
      const gTasks = tasks.filter((t) => t.stationId === stationId);
      const ready = gItems.every((i) => i.status === OrderItemStatus.READY || i.status === OrderItemStatus.CANCELLED);
      return { stationId, stationCode: gTasks[0]?.stationCode ?? (stationId ? null : 'NO_PRODUCTION'), items: gItems, tasks: gTasks, ready };
    });
    return {
      ...toOrderSummary(o),
      items,
      tasks,
      groups,
      groupsReady: groups.filter((g) => g.ready).length,
      groupsTotal: groups.length,
      note: o.note,
    };
  }

  async board(branchId: string, actor: Actor): Promise<DispatchBoardView> {
    assertBranchAccess(actor, branchId);
    const now = this.clock.now();
    const thresholds = await this.settings.productionThresholds(branchId);
    const rows = await this.prisma.client.order.findMany({
      where: { branchId, status: { in: [...PREPARING, OrderStatus.READY_FOR_ASSEMBLY, OrderStatus.READY_FOR_PICKUP] } },
      include: orderInclude,
      orderBy: { targetReadyAt: 'asc' },
    });
    const views = rows.map((o) => this.toDispatchOrder(o, now, thresholds));
    return {
      branchId,
      serverTime: now.toISOString(),
      preparing: views.filter((v) => PREPARING.includes(v.status)),
      readyForAssembly: views.filter((v) => v.status === OrderStatus.READY_FOR_ASSEMBLY),
      readyForPickup: views.filter((v) => v.status === OrderStatus.READY_FOR_PICKUP),
    };
  }

  /** ORDER READY FOR CUSTOMER → READY_FOR_PICKUP. */
  async readyForCustomer(orderId: string, actor: Actor, force = false) {
    const order = await this.engine.loadOrThrow(orderId);
    assertBranchAccess(actor, order.branchId);
    const events: DomainEvent[] = [];
    await this.prisma.tx(async (tx) => {
      let from = order.status;
      if (from !== OrderStatus.READY_FOR_ASSEMBLY) {
        if (!force) throw new StateConflictError(`Order is ${from}; all production groups must be ready`, { status: from });
        if (!hasPermission(actor, Permission.ORDERS_FORCE_READY)) throw new ForbiddenError('Missing permission: orders.force_ready');
        if (!PREPARING.includes(from)) throw new StateConflictError(`Order is ${from}`, { status: from });
        const now = this.clock.now();
        await tx.productionTask.updateMany({
          where: { orderId, status: { in: [ProductionTaskStatus.SCHEDULED, ProductionTaskStatus.IN_PRODUCTION] } },
          data: { status: ProductionTaskStatus.READY, actualReadyAt: now, readyByUserId: actor.kind === 'user' ? actor.id : null, version: { increment: 1 } },
        });
        await tx.orderItem.updateMany({ where: { orderId, status: { in: [OrderItemStatus.PENDING, OrderItemStatus.IN_PRODUCTION] } }, data: { status: OrderItemStatus.READY } });
        await this.audit.record(actor, { action: 'FORCE_READY', entityType: 'Order', entityId: orderId, orderId, branchId: order.branchId, metadata: { from } }, tx);
        events.push(...(await this.engine.rollupFromTasks(tx, orderId, actor)));
        from = OrderStatus.READY_FOR_ASSEMBLY;
      }
      events.push(...(await this.engine.transition(tx, orderId, from, OrderStatus.READY_FOR_PICKUP, actor)));
      await this.audit.record(actor, { action: 'DISPATCH_READY', entityType: 'Order', entityId: orderId, orderId, branchId: order.branchId }, tx);
    });
    await this.bus.publishAll(events);
    return this.engine.getView(orderId, actor);
  }

  /** MARK AS HANDED OVER → COMPLETED. */
  async handOver(orderId: string, actor: Actor) {
    const order = await this.engine.loadOrThrow(orderId);
    assertBranchAccess(actor, order.branchId);
    const events: DomainEvent[] = [];
    await this.prisma.tx(async (tx) => {
      events.push(...(await this.engine.transition(tx, orderId, OrderStatus.READY_FOR_PICKUP, OrderStatus.COMPLETED, actor)));
      await this.audit.record(actor, { action: 'HANDED_OVER', entityType: 'Order', entityId: orderId, orderId, branchId: order.branchId }, tx);
    });
    await this.bus.publishAll(events);
    return this.engine.getView(orderId, actor);
  }

  /** Not used by the flow itself; kept so realtime can broadcast a dispatch snapshot if needed. */
  async summaryEvent(orderId: string) {
    const order = await this.engine.loadOrThrow(orderId);
    return makeEvent(RealtimeEventType.ORDER_STATUS_CHANGED, order.branchId, { orderId, publicNumber: order.publicNumber, from: null, to: order.status }, { orderId });
  }
}

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('board')
  @RequirePermissions(Permission.DISPATCH_READ)
  board(@CurrentActor() actor: Actor, @Query('branchId') branchId?: string) {
    const b = scopedBranchId(actor, branchId ?? null);
    if (!b) throw new ValidationError('branchId is required');
    return this.dispatch.board(b, actor);
  }

  @Post('orders/:id/ready-for-customer')
  @RequirePermissions(Permission.DISPATCH_READY)
  ready(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor, @Query('force') force?: string) {
    return this.dispatch.readyForCustomer(id, actor, force === 'true');
  }

  @Post('orders/:id/handed-over')
  @RequirePermissions(Permission.DISPATCH_HANDOVER)
  handOver(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.dispatch.handOver(id, actor);
  }
}

@Module({ imports: [OrdersModule], controllers: [DispatchController], providers: [DispatchService], exports: [DispatchService] })
export class DispatchModule {}
