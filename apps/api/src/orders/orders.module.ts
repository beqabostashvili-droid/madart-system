import { Module } from '@nestjs/common';
import { OrderEngineService } from './order-engine.service';
import { OrderNumberService } from './order-number.service';
import { PickupSlotsService } from './pickup-slots.service';
import { ProductionPlannerService } from './production-planner.service';

/** Order Engine core – no controllers; HTTP lives in OrdersHttpModule. */
@Module({
  providers: [OrderEngineService, OrderNumberService, ProductionPlannerService, PickupSlotsService],
  exports: [OrderEngineService, PickupSlotsService, ProductionPlannerService],
})
export class OrdersModule {}
