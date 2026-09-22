import { computeAsapTargetReadyAt, computePickupSlots, type PlannableItem, ProductionTaskStatus } from '@madart/domain';
import type { PickupSlotsQuoteBody, PickupSlotsResponse } from '@madart/types';
import { Injectable } from '@nestjs/common';
import { openingWindow } from '../branches/branches.service';
import { Clock } from '../common/clock';
import { NotFoundError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';

/** Pickup slot availability for mobile ordering (spec §8–9, ASSUMPTION A-14). */
@Injectable()
export class PickupSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async quote(body: PickupSlotsQuoteBody): Promise<PickupSlotsResponse> {
    const branch = await this.prisma.client.branch.findUnique({ where: { id: body.branchId } });
    if (!branch) throw new NotFoundError('Branch', body.branchId);
    const now = this.clock.now();
    const day = body.date ? new Date(`${body.date}T12:00:00Z`) : now;
    const window = openingWindow(branch, day);

    const products = await this.prisma.client.product.findMany({
      where: { id: { in: body.items.map((i) => i.productId) } },
      include: { productionConfig: true, branches: { where: { branchId: branch.id } } },
    });
    const items: PlannableItem[] = body.items.map((i) => {
      const p = products.find((x) => x.id === i.productId);
      const cfg = p?.productionConfig;
      return {
        itemId: i.productId,
        productionRequired: cfg?.productionRequired ?? false,
        stationId: p?.branches[0]?.stationOverrideId ?? cfg?.stationId ?? null,
        productionTimeMinutes: cfg?.productionTimeMinutes ?? 0,
        preparationBufferMinutes: cfg?.preparationBufferMinutes ?? 0,
        capacityUnits: cfg?.capacityUnits ?? 1,
        quantity: i.quantity,
        priority: cfg?.priority ?? 0,
      };
    });

    const [rules, load] = await Promise.all([
      this.prisma.client.capacityRule.findMany({ where: { branchId: branch.id, active: true } }),
      this.prisma.client.productionTask.findMany({
        where: { branchId: branch.id, status: { in: [ProductionTaskStatus.SCHEDULED, ProductionTaskStatus.IN_PRODUCTION] }, plannedReadyAt: { gte: window.opensAt }, plannedStartAt: { lte: window.closesAt } },
        select: { stationId: true, plannedStartAt: true, plannedReadyAt: true, capacityUnits: true },
      }),
    ]);

    const slots = window.closed
      ? []
      : computePickupSlots({
          now,
          opensAt: window.opensAt,
          closesAt: window.closesAt,
          slotMinutes: branch.pickupSlotMinutes,
          minLeadMinutes: branch.pickupMinLeadMinutes,
          rules: rules.map((r) => ({ stationId: r.stationId, windowMinutes: r.windowMinutes, maxCapacityUnits: r.maxCapacityUnits })),
          existingLoad: load,
          items,
        });

    return {
      branchId: branch.id,
      asapReadyAt: computeAsapTargetReadyAt(items, now).toISOString(),
      slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), available: s.available, reason: s.reason })),
    };
  }
}
