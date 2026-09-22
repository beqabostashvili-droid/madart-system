import type { TransactionClient } from '@madart/database';
import { buildProductionPlan, OrderItemStatus, OrderStatus, type PlannableItem, ProductionTaskStatus } from '@madart/domain';
import { Injectable, Logger } from '@nestjs/common';
import type { Actor } from '../auth/actor';
import { logEvent } from '../common/logging/request-logger.interceptor';

export interface PlanResult {
  taskIds: string[];
  targetAdjustedTo: Date | null;
}

/**
 * Creates ProductionTasks (+ one TOTAL ProductionStep each) for a paid order.
 * Pure scheduling math lives in @madart/domain; this service persists it.
 */
@Injectable()
export class ProductionPlannerService {
  private readonly logger = new Logger(ProductionPlannerService.name);

  async plan(tx: TransactionClient, orderId: string, now: Date, actor: Actor | null): Promise<PlanResult> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });

    const items: PlannableItem[] = order.items
      .filter((i) => i.status !== OrderItemStatus.CANCELLED)
      .map((i) => ({
        itemId: i.id,
        productionRequired: i.productionRequired,
        stationId: i.stationIdSnapshot,
        productionTimeMinutes: i.productionTimeSnapshot,
        preparationBufferMinutes: i.bufferSnapshot,
        capacityUnits: i.capacityUnitsSnapshot,
        quantity: i.quantity,
        priority: i.prioritySnapshot,
      }));

    const plan = buildProductionPlan(items, order.targetReadyAt, now);

    const taskIds: string[] = [];
    for (const t of plan.tasks) {
      const task = await tx.productionTask.create({
        data: {
          orderId: order.id,
          orderItemId: t.itemId,
          branchId: order.branchId,
          stationId: t.stationId,
          status: ProductionTaskStatus.SCHEDULED,
          quantity: t.quantity,
          capacityUnits: t.capacityUnits,
          durationMinutes: t.durationMinutes,
          priority: t.priority,
          plannedStartAt: t.plannedStartAt,
          plannedReadyAt: t.plannedReadyAt,
          steps: {
            create: [{ sequence: 1, code: 'TOTAL', durationMinutes: t.durationMinutes, plannedStartAt: t.plannedStartAt, plannedReadyAt: t.plannedReadyAt }],
          },
        },
      });
      taskIds.push(task.id);
    }

    // Items that need no production are ready as soon as the order is confirmed.
    await tx.orderItem.updateMany({
      where: { orderId: order.id, productionRequired: false, status: OrderItemStatus.PENDING },
      data: { status: OrderItemStatus.READY },
    });

    let targetAdjustedTo: Date | null = null;
    if (plan.effectiveReadyAt.getTime() > order.targetReadyAt.getTime()) {
      targetAdjustedTo = plan.effectiveReadyAt;
      await tx.order.update({ where: { id: order.id }, data: { targetReadyAt: plan.effectiveReadyAt } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: OrderStatus.CONFIRMED,
          toStatus: OrderStatus.CONFIRMED,
          actorType: 'SYSTEM',
          actorId: actor?.id ?? null,
          reason: `TARGET_ADJUSTED to ${plan.effectiveReadyAt.toISOString()}`,
        },
      });
    }

    logEvent(this.logger, 'production planned', {
      order_id: order.id,
      public_order_number: order.publicNumber,
      branch_id: order.branchId,
      tasks: plan.tasks.length,
      late: plan.tasks.filter((t) => t.late).length,
    });

    return { taskIds, targetAdjustedTo };
  }
}
