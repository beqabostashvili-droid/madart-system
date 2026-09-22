import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersModule } from './orders.module';

@Module({
  imports: [OrdersModule, PaymentsModule],
  controllers: [OrdersController],
})
export class OrdersHttpModule {}
