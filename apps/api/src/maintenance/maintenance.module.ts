import { Permission } from '@madart/domain';
import { type PurgeOrdersBody, purgeOrdersBody, type PurgeOrdersResult } from '@madart/types';
import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import type { Actor } from '../auth/actor';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { zod } from '../common/validation/zod.pipe';

/**
 * Operational-data reset for demo/test runs, the in-app counterpart of
 * `pnpm db:clean`. Removes every order with everything hanging off it and
 * restarts order numbering; never touches catalog, promotions, organisation,
 * devices or users.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
}

@Controller('admin/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post('purge-orders')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  purgeOrders(@Body(zod(purgeOrdersBody)) _body: PurgeOrdersBody, @CurrentActor() actor: Actor) {
    return this.maintenance.purgeOrders(actor);
  }
}

@Module({ controllers: [MaintenanceController], providers: [MaintenanceService] })
export class MaintenanceModule {}
