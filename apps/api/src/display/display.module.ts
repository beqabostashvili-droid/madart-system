import { DISPLAY_PREPARING_STATUSES, OrderStatus, ValidationError } from '@madart/domain';
import type { DisplayBoardView } from '@madart/types';
import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { type Actor, scopedBranchId } from '../auth/actor';
import { CurrentActor } from '../auth/decorators';
import { Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';

/** Customer display board – order numbers only, never personal data (spec §10). */
@Injectable()
export class DisplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
  ) {}

  async board(branchId: string): Promise<DisplayBoardView> {
    const now = this.clock.now();
    const retention = await this.settings.get('display.readyRetentionMinutes', branchId);
    const rows = await this.prisma.client.order.findMany({
      where: {
        branchId,
        OR: [
          { status: { in: [...DISPLAY_PREPARING_STATUSES] } },
          { status: OrderStatus.READY_FOR_PICKUP, readyForPickupAt: { gte: new Date(now.getTime() - retention * 60_000) } },
        ],
      },
      select: { id: true, publicNumber: true, status: true, confirmedAt: true, readyForPickupAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      branchId,
      serverTime: now.toISOString(),
      preparing: rows
        .filter((r) => r.status !== OrderStatus.READY_FOR_PICKUP)
        .map((r) => ({ orderId: r.id, publicNumber: r.publicNumber, status: r.status, since: (r.confirmedAt ?? r.createdAt).toISOString() })),
      ready: rows
        .filter((r) => r.status === OrderStatus.READY_FOR_PICKUP)
        .sort((a, b) => (b.readyForPickupAt?.getTime() ?? 0) - (a.readyForPickupAt?.getTime() ?? 0))
        .map((r) => ({ orderId: r.id, publicNumber: r.publicNumber, status: r.status, since: (r.readyForPickupAt ?? r.createdAt).toISOString() })),
    };
  }
}

@Controller('display')
export class DisplayController {
  constructor(private readonly display: DisplayService) {}

  /** Any authenticated actor of the branch (display devices have no permissions). */
  @Get('board')
  board(@CurrentActor() actor: Actor, @Query('branchId') branchId?: string) {
    const b = scopedBranchId(actor, branchId ?? null);
    if (!b) throw new ValidationError('branchId is required');
    return this.display.board(b);
  }
}

@Module({ controllers: [DisplayController], providers: [DisplayService], exports: [DisplayService] })
export class DisplayModule {}
