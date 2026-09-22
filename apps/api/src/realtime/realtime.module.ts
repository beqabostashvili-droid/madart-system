import { Module } from '@nestjs/common';
import { DisplayModule } from '../display/display.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [DisplayModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
