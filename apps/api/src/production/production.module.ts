import { Permission } from '@madart/domain';
import { Controller, Get, Injectable, Logger, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { type Actor, scopedBranchId } from '../auth/actor';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { ValidationError } from '@madart/domain';
import { OrdersModule } from '../orders/orders.module';
import { ProductionService } from './production.service';

@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get('board')
  @RequirePermissions(Permission.PRODUCTION_READ)
  board(@CurrentActor() actor: Actor, @Query('branchId') branchId?: string, @Query('stationId') stationId?: string) {
    const resolvedBranch = scopedBranchId(actor, branchId ?? null);
    if (!resolvedBranch) throw new ValidationError('branchId is required');
    const resolvedStation = stationId ?? (actor.kind === 'device' ? actor.stationId : null);
    return this.production.board(resolvedBranch, resolvedStation ?? null, actor);
  }

  @Post('tasks/:id/start')
  @RequirePermissions(Permission.PRODUCTION_START)
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.production.start(id, actor);
  }

  @Post('tasks/:id/ready')
  @RequirePermissions(Permission.PRODUCTION_READY)
  ready(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.production.ready(id, actor);
  }
}

@Injectable()
export class ProductionTickService {
  private readonly logger = new Logger(ProductionTickService.name);
  constructor(private readonly production: ProductionService) {}

  @Interval(30_000)
  async tick() {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const n = await this.production.tickStartingSoon();
      if (n > 0) this.logger.log(JSON.stringify({ msg: 'starting soon emitted', count: n }));
    } catch (err) {
      this.logger.error(`tick failed: ${(err as Error).message}`);
    }
  }
}

@Module({
  imports: [OrdersModule],
  controllers: [ProductionController],
  providers: [ProductionService, ProductionTickService],
  exports: [ProductionService],
})
export class ProductionModule {}
