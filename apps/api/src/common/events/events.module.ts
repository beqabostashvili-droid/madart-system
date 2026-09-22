import { Global, Logger, Module } from '@nestjs/common';
import { getEnv } from '../../config/env';
import { EventBus, InMemoryEventBus, RedisEventBus } from './event-bus';

@Global()
@Module({
  providers: [
    {
      provide: EventBus,
      useFactory: () => {
        const env = getEnv();
        if (env.REDIS_URL) {
          new Logger('EventBus').log('using Redis event bus');
          return new RedisEventBus(env.REDIS_URL);
        }
        return new InMemoryEventBus();
      },
    },
  ],
  exports: [EventBus],
})
export class EventsModule {}
