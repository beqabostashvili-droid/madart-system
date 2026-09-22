import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CatalogImportModule } from './catalog-import/catalog-import.module';
import { CatalogModule } from './catalog/catalog.module';
import { CommonModule } from './common/common.module';
import { GlobalExceptionFilter } from './common/errors/http-exception.filter';
import { EventsModule } from './common/events/events.module';
import { RequestLoggerInterceptor } from './common/logging/request-logger.interceptor';
import { PrismaModule } from './common/prisma/prisma.module';
import { DevicesModule } from './devices/devices.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { DisplayModule } from './display/display.module';
import { HealthModule } from './health/health.module';
import { OrdersHttpModule } from './orders/orders-http.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductionModule } from './production/production.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReportsModule } from './reports/reports.module';
import { StationsModule } from './stations/stations.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    EventsModule,
    CommonModule,
    AuthModule,
    BranchesModule,
    StationsModule,
    CatalogModule,
    DevicesModule,
    UsersModule,
    OrdersModule,
    PaymentsModule,
    OrdersHttpModule,
    ProductionModule,
    DispatchModule,
    DisplayModule,
    RealtimeModule,
    CatalogImportModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
