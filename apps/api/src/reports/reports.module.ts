import { OrderStatus, Permission } from '@madart/domain';
import { type AuditLogView, type AuditQuery, auditQuery, type DashboardView, type OrderTimelineEntry, type Paginated } from '@madart/types';
import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { type Actor, assertBranchAccess, scopedBranchId } from '../auth/actor';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { zod } from '../common/validation/zod.pipe';
import { OrderEngineService } from '../orders/order-engine.service';
import { OrdersModule } from '../orders/orders.module';

const SOLD_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.SCHEDULED, OrderStatus.IN_PRODUCTION, OrderStatus.PARTIALLY_READY, OrderStatus.READY_FOR_ASSEMBLY, OrderStatus.READY_FOR_PICKUP, OrderStatus.COMPLETED];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly engine: OrderEngineService,
  ) {}

  async dashboard(branchId: string | null): Promise<DashboardView> {
    const now = this.clock.now();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const where = { ...(branchId ? { branchId } : {}), createdAt: { gte: dayStart }, status: { in: SOLD_STATUSES } };

    const [orders, items, tasks, active] = await Promise.all([
      this.prisma.client.order.findMany({ where, select: { total: true, source: true } }),
      this.prisma.client.orderItem.groupBy({ by: ['productId', 'nameSnapshot'], where: { order: where }, _sum: { quantity: true, lineTotal: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 10 }),
      this.prisma.client.productionTask.findMany({
        where: { ...(branchId ? { branchId } : {}), createdAt: { gte: dayStart }, status: 'READY', actualStartedAt: { not: null }, actualReadyAt: { not: null } },
        select: { actualStartedAt: true, actualReadyAt: true, plannedReadyAt: true },
      }),
      this.prisma.client.order.count({ where: { ...(branchId ? { branchId } : {}), status: { in: [OrderStatus.SCHEDULED, OrderStatus.IN_PRODUCTION, OrderStatus.PARTIALLY_READY, OrderStatus.READY_FOR_ASSEMBLY, OrderStatus.READY_FOR_PICKUP] } } }),
    ]);

    const salesToday = orders.reduce((s, o) => s + o.total, 0);
    const bySource: Record<string, number> = {};
    const salesBySource: Record<string, number> = {};
    for (const o of orders) {
      bySource[o.source] = (bySource[o.source] ?? 0) + 1;
      salesBySource[o.source] = (salesBySource[o.source] ?? 0) + o.total;
    }
    const durations = tasks.map((t) => (t.actualReadyAt!.getTime() - t.actualStartedAt!.getTime()) / 60_000);
    const delays = tasks.map((t) => (t.actualReadyAt!.getTime() - t.plannedReadyAt.getTime()) / 60_000);
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

    return {
      branchId,
      date: dayStart.toISOString().slice(0, 10),
      salesToday,
      ordersToday: orders.length,
      averageOrderValue: orders.length ? Math.round(salesToday / orders.length) : 0,
      ordersBySource: bySource,
      salesBySource,
      averageProductionMinutes: avg(durations),
      averageDelayMinutes: avg(delays),
      lateOrders: delays.filter((d) => d > 0).length,
      topProducts: items.map((i) => ({ productId: i.productId, name: i.nameSnapshot, quantity: i._sum.quantity ?? 0, revenue: i._sum.lineTotal ?? 0 })),
      activeOrders: active,
    };
  }

  /** Admin order timeline (spec §52) – built from history/payment/audit rows, never from UI text. */
  async timeline(orderId: string, actor: Actor): Promise<OrderTimelineEntry[]> {
    const order = await this.engine.loadOrThrow(orderId);
    assertBranchAccess(actor, order.branchId);
    const [paymentHistory, audits] = await Promise.all([
      this.prisma.client.paymentStatusHistory.findMany({ where: { payment: { orderId } }, include: { payment: true }, orderBy: { at: 'asc' } }),
      this.prisma.client.auditLog.findMany({ where: { orderId }, orderBy: { at: 'asc' } }),
    ]);
    const entries: OrderTimelineEntry[] = [];
    for (const h of order.history) entries.push({ at: h.at.toISOString(), kind: 'ORDER', label: h.fromStatus === h.toStatus ? (h.reason ?? h.toStatus) : `Order ${h.toStatus}`, detail: h.reason ?? undefined });
    for (const p of paymentHistory) entries.push({ at: p.at.toISOString(), kind: 'PAYMENT', label: `Payment ${p.toStatus}`, detail: `${p.payment.method} ${p.payment.amount / 100} GEL${p.note ? ` · ${p.note}` : ''}` });
    for (const t of order.tasks) {
      const name = order.items.find((i) => i.id === t.orderItemId)?.nameSnapshot ?? 'item';
      if (t.actualStartedAt) entries.push({ at: t.actualStartedAt.toISOString(), kind: 'PRODUCTION', label: `${name} started`, detail: `planned ${t.plannedStartAt.toISOString()}` });
      if (t.actualReadyAt) entries.push({ at: t.actualReadyAt.toISOString(), kind: 'PRODUCTION', label: `${name} ready`, detail: `planned ${t.plannedReadyAt.toISOString()}` });
    }
    for (const a of audits) {
      if (['PRODUCTION_START', 'PRODUCTION_READY'].includes(a.action)) continue; // already covered by tasks
      entries.push({ at: a.at.toISOString(), kind: 'AUDIT', label: a.action, detail: a.actorName ?? undefined });
    }
    return entries.sort((a, b) => a.at.localeCompare(b.at));
  }

  async auditLogs(q: AuditQuery, actor: Actor): Promise<Paginated<AuditLogView>> {
    const branchId = scopedBranchId(actor, q.branchId ?? null);
    const where = {
      ...(branchId ? { branchId } : {}),
      ...(q.orderId ? { orderId: q.orderId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to ? { at: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({ where, orderBy: { at: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.client.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ id: r.id, at: r.at.toISOString(), actorType: r.actorType, actorId: r.actorId, actorName: r.actorName, action: r.action, entityType: r.entityType, entityId: r.entityId, branchId: r.branchId, orderId: r.orderId, metadata: (r.metadata as Record<string, unknown>) ?? null })),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  }
}

@Controller('admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(Permission.REPORTS_READ)
  dashboard(@CurrentActor() actor: Actor, @Query('branchId') branchId?: string) {
    return this.reports.dashboard(scopedBranchId(actor, branchId ?? null));
  }

  @Get('orders/:id/timeline')
  @RequirePermissions(Permission.ORDERS_READ)
  timeline(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.reports.timeline(id, actor);
  }

  @Get('audit-logs')
  @RequirePermissions(Permission.AUDIT_READ)
  audit(@Query(zod(auditQuery)) q: AuditQuery, @CurrentActor() actor: Actor) {
    return this.reports.auditLogs(q, actor);
  }
}

@Module({ imports: [OrdersModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
