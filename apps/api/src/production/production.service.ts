import { compareTasksForBoard, isOnMainBoard, OrderItemStatus, OrderStatus, ProductionTaskStatus } from '@madart/domain';
import { type ProductionBoardView, type ProductionTaskView, RealtimeEventType } from '@madart/types';
import { Injectable, Logger } from '@nestjs/common';
import { type Actor, assertBranchAccess } from '../auth/actor';
import { AuditService } from '../common/audit/audit.service';
import { Clock } from '../common/clock';
import { NotFoundError, StateConflictError } from '../common/errors/http-exception.filter';
import { type DomainEvent, EventBus, makeEvent } from '../common/events/event-bus';
import { logEvent } from '../common/logging/request-logger.interceptor';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { OrderEngineService } from '../orders/order-engine.service';
import { toTaskView } from '../orders/order-view.mapper';

const taskInclude = { station: true, orderItem: true, order: true } as const;

/** KDS operations (spec §11, §14, §15, §57). */
@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly engine: OrderEngineService,
    private readonly audit: AuditService,
    private readonly bus: EventBus,
  ) {}

  async board(branchId: string, stationId: string | null, actor: Actor): Promise<ProductionBoardView> {
    assertBranchAccess(actor, branchId);
    if (actor.kind === 'device' && actor.deviceType === 'PRODUCTION' && actor.stationId && stationId && actor.stationId !== stationId) {
      stationId = actor.stationId; // a station screen only ever sees its own station
    }
    const now = this.clock.now();
    const thresholds = await this.settings.productionThresholds(branchId);
    const readyRetention = await this.settings.get('production.readyRetentionMinutes', branchId);

    const rows = await this.prisma.client.productionTask.findMany({
      where: {
        branchId,
        ...(stationId ? { stationId } : {}),
        OR: [
          { status: { in: [ProductionTaskStatus.SCHEDULED, ProductionTaskStatus.IN_PRODUCTION] } },
          { status: ProductionTaskStatus.READY, actualReadyAt: { gte: new Date(now.getTime() - readyRetention * 60_000) } },
        ],
        order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } },
      },
      include: taskInclude,
    });

    const views = rows.map((t) => ({ row: t, view: toTaskView(t, t.order, now, thresholds) }));
    const live = views.filter((v) => v.row.status !== ProductionTaskStatus.READY);
    const onBoard = live.filter((v) => isOnMainBoard(v.row, now, thresholds.boardHorizonMinutes));
    const upcoming = live.filter((v) => !isOnMainBoard(v.row, now, thresholds.boardHorizonMinutes));
    const sortRows = (a: (typeof views)[number], b: (typeof views)[number]) =>
      compareTasksForBoard({ ...a.row, targetReadyAt: a.row.order.targetReadyAt }, { ...b.row, targetReadyAt: b.row.order.targetReadyAt }, now, thresholds);

    return {
      branchId,
      stationId,
      serverTime: now.toISOString(),
      thresholds,
      tasks: onBoard.sort(sortRows).map((v) => v.view),
      upcoming: upcoming.sort(sortRows).map((v) => v.view),
      readyRecent: views
        .filter((v) => v.row.status === ProductionTaskStatus.READY)
        .sort((a, b) => (b.row.actualReadyAt?.getTime() ?? 0) - (a.row.actualReadyAt?.getTime() ?? 0))
        .map((v) => v.view),
    };
  }

  async start(taskId: string, actor: Actor): Promise<ProductionTaskView> {
    return this.act(taskId, actor, 'START');
  }

  async ready(taskId: string, actor: Actor): Promise<ProductionTaskView> {
    return this.act(taskId, actor, 'READY');
  }

  /**
   * START: SCHEDULED → IN_PRODUCTION; READY: IN_PRODUCTION → READY.
   * The backend is authoritative: a second concurrent press finds 0 rows and
   * gets a 409 with the current task, never a double execution (spec §57).
   */
  private async act(taskId: string, actor: Actor, action: 'START' | 'READY'): Promise<ProductionTaskView> {
    const task = await this.prisma.client.productionTask.findUnique({ where: { id: taskId }, include: taskInclude });
    if (!task) throw new NotFoundError('ProductionTask', taskId);
    assertBranchAccess(actor, task.branchId);
    if (actor.kind === 'device' && actor.deviceType === 'PRODUCTION' && actor.stationId && actor.stationId !== task.stationId) {
      throw new StateConflictError('Task belongs to another station');
    }
    const now = this.clock.now();
    const from = action === 'START' ? ProductionTaskStatus.SCHEDULED : ProductionTaskStatus.IN_PRODUCTION;
    const to = action === 'START' ? ProductionTaskStatus.IN_PRODUCTION : ProductionTaskStatus.READY;
    const byUser = actor.kind === 'user' ? actor.id : null;
    const byDevice = actor.kind === 'device' ? actor.id : null;

    const events: DomainEvent[] = [];
    await this.prisma.tx(async (tx) => {
      const res = await tx.productionTask.updateMany({
        where: { id: taskId, status: from },
        data:
          action === 'START'
            ? { status: to, actualStartedAt: now, startedByUserId: byUser, startedByDeviceId: byDevice, version: { increment: 1 } }
            : { status: to, actualReadyAt: now, readyByUserId: byUser, readyByDeviceId: byDevice, version: { increment: 1 } },
      });
      if (res.count !== 1) {
        const current = await tx.productionTask.findUnique({ where: { id: taskId }, include: taskInclude });
        const thresholds = await this.settings.productionThresholds(task.branchId);
        throw new StateConflictError(`Task is ${current?.status}, expected ${from}`, current ? toTaskView(current, current.order, now, thresholds) : undefined);
      }
      await tx.productionStep.updateMany({
        where: { taskId, status: from },
        data: action === 'START' ? { status: to, actualStartedAt: now } : { status: to, actualReadyAt: now },
      });
      await tx.orderItem.update({
        where: { id: task.orderItemId },
        data: { status: action === 'START' ? OrderItemStatus.IN_PRODUCTION : OrderItemStatus.READY },
      });
      await this.audit.record(
        actor,
        { action: `PRODUCTION_${action}`, entityType: 'ProductionTask', entityId: taskId, orderId: task.orderId, branchId: task.branchId, metadata: { stationId: task.stationId, plannedStartAt: task.plannedStartAt, plannedReadyAt: task.plannedReadyAt, at: now } },
        tx,
      );
      events.push(...(await this.engine.rollupFromTasks(tx, task.orderId, actor)));
    });

    const fresh = await this.prisma.client.productionTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    const thresholds = await this.settings.productionThresholds(task.branchId);
    const view = toTaskView(fresh, fresh.order, now, thresholds);
    events.unshift(
      makeEvent(action === 'START' ? RealtimeEventType.PRODUCTION_STARTED : RealtimeEventType.PRODUCTION_ITEM_READY, task.branchId, view, { stationId: task.stationId, orderId: task.orderId }, now),
    );
    logEvent(this.logger, `production ${action.toLowerCase()}`, { production_task_id: taskId, order_id: task.orderId, public_order_number: fresh.order.publicNumber, branch_id: task.branchId, station_id: task.stationId, actor: actor.id });
    await this.bus.publishAll(events);
    return view;
  }

  /** Emits PRODUCTION_STARTING_SOON once per task when the threshold is crossed. */
  async tickStartingSoon(): Promise<number> {
    const now = this.clock.now();
    const candidates = await this.prisma.client.productionTask.findMany({
      where: { status: ProductionTaskStatus.SCHEDULED, startingSoonNotifiedAt: null, plannedStartAt: { lte: new Date(now.getTime() + 15 * 60_000) } },
      include: { order: { select: { publicNumber: true, branchId: true } } },
    });
    let emitted = 0;
    for (const t of candidates) {
      const thresholds = await this.settings.productionThresholds(t.branchId);
      if (t.plannedStartAt.getTime() - now.getTime() > thresholds.startingSoonMinutes * 60_000) continue;
      const res = await this.prisma.client.productionTask.updateMany({ where: { id: t.id, startingSoonNotifiedAt: null }, data: { startingSoonNotifiedAt: now } });
      if (res.count !== 1) continue;
      await this.bus.publish(makeEvent(RealtimeEventType.PRODUCTION_STARTING_SOON, t.branchId, { taskId: t.id, stationId: t.stationId, publicNumber: t.order.publicNumber }, { stationId: t.stationId, orderId: t.orderId }, now));
      emitted++;
    }
    return emitted;
  }
}
