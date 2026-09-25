import { Permission } from '@madart/domain';
import { type DeleteOrdersBody, deleteOrdersBody, type DeleteOrdersResult, type PurgeOrdersBody, purgeOrdersBody, type PurgeOrdersResult } from '@madart/types';
import { Body, Controller, Delete, Injectable, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { Actor } from '../auth/actor';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { NotFoundError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';
import { zod } from '../common/validation/zod.pipe';

/**
 * Hard deletion of operational data for demo/test runs. Cancelling keeps an
 * order on record; these calls remove it entirely with everything hanging
 * off it. Never touches catalog, promotions, organisation, devices or users.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The in-app counterpart of `pnpm db:clean`: every order, and order numbering restarts. */
  async purgeOrders(actor: Actor): Promise<PurgeOrdersResult> {
    const db = this.prisma.client;
    const [orders, payments, productionTasks] = await Promise.all([db.order.count(), db.payment.count(), db.productionTask.count()]);
    // Order of deletes follows the foreign keys that have no cascade (payments, audit rows).
    await db.$transaction([
      db.auditLog.deleteMany({ where: { orderId: { not: null } } }),
      db.refund.deleteMany(),
      db.paymentStatusHistory.deleteMany(),
      db.payment.deleteMany(),
      db.productionStep.deleteMany(),
      db.productionTask.deleteMany(),
      db.orderItemModifier.deleteMany(),
      db.orderItem.deleteMany(),
      db.orderStatusHistory.deleteMany(),
      db.order.deleteMany(),
      db.orderNumberSequence.deleteMany(),
      db.idempotencyKey.deleteMany(),
    ]);
    await this.audit.record(actor, { action: 'ORDERS_PURGED', entityType: 'System', entityId: 'orders', metadata: { orders, payments, productionTasks } });
    return { orders, payments, productionTasks };
  }

  async deleteOrders(ids: string[], actor: Actor): Promise<DeleteOrdersResult> {
    const db = this.prisma.client;
    const found = await db.order.findMany({ where: { id: { in: ids } }, select: { id: true, publicNumber: true, branchId: true } });
    if (found.length === 0) throw new NotFoundError('Order', ids[0] ?? '');
    const orderIds = found.map((o) => o.id);
    const byPayment = { payment: { orderId: { in: orderIds } } };
    await db.$transaction([
      db.auditLog.deleteMany({ where: { orderId: { in: orderIds } } }),
      db.refund.deleteMany({ where: byPayment }),
      db.paymentStatusHistory.deleteMany({ where: byPayment }),
      db.payment.deleteMany({ where: { orderId: { in: orderIds } } }),
      // items, modifiers, status history, production tasks and steps cascade from the order
      db.order.deleteMany({ where: { id: { in: orderIds } } }),
    ]);
    await this.audit.record(actor, {
      action: 'ORDERS_DELETED',
      entityType: 'Order',
      entityId: orderIds.length === 1 ? orderIds[0]! : 'bulk',
      branchId: found.length === 1 ? found[0]!.branchId : undefined,
      metadata: { count: found.length, numbers: found.map((o) => o.publicNumber) },
    });
    return { deleted: found.length };
  }
}

@Controller('admin')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post('maintenance/purge-orders')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  purgeOrders(@Body(zod(purgeOrdersBody)) _body: PurgeOrdersBody, @CurrentActor() actor: Actor) {
    return this.maintenance.purgeOrders(actor);
  }

  @Delete('orders/:id')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  deleteOrder(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.maintenance.deleteOrders([id], actor);
  }

  @Post('orders/bulk-delete')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  bulkDelete(@Body(zod(deleteOrdersBody)) body: DeleteOrdersBody, @CurrentActor() actor: Actor) {
    return this.maintenance.deleteOrders(body.ids, actor);
  }
}

@Module({ controllers: [MaintenanceController], providers: [MaintenanceService] })
export class MaintenanceModule {}
