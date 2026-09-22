import type { AnyRealtimeEnvelope, RealtimeEnvelope, RealtimeEventType, RealtimePayloads } from '@madart/types';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

export type DomainEvent = AnyRealtimeEnvelope;
export type EventHandler = (event: DomainEvent) => void | Promise<void>;

/** Builds a typed envelope. */
export function makeEvent<T extends RealtimeEventType>(
  type: T,
  branchId: string,
  payload: RealtimePayloads[T],
  scope: { stationId?: string | null; orderId?: string | null } = {},
  at: Date = new Date(),
): RealtimeEnvelope<T> {
  return {
    id: randomUUID(),
    type,
    at: at.toISOString(),
    branchId,
    stationId: scope.stationId ?? null,
    orderId: scope.orderId ?? null,
    payload,
  };
}

/**
 * Internal publish/subscribe bus (ASSUMPTION A-07). Services publish after
 * their transaction commits; the realtime gateway and other listeners react.
 */
export abstract class EventBus {
  abstract publish(event: DomainEvent): Promise<void>;
  abstract subscribe(handler: EventHandler): () => void;
  publishAll(events: DomainEvent[]): Promise<void> {
    return Promise.all(events.map((e) => this.publish(e))).then(() => undefined);
  }
}

@Injectable()
export class InMemoryEventBus extends EventBus {
  private readonly logger = new Logger(InMemoryEventBus.name);
  private readonly handlers = new Set<EventHandler>();

  async publish(event: DomainEvent) {
    for (const h of this.handlers) {
      try {
        await h(event);
      } catch (err) {
        this.logger.error(`handler failed for ${event.type}: ${(err as Error).message}`);
      }
    }
  }

  subscribe(handler: EventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

/** Redis pub/sub bus for multi-instance deployments. */
@Injectable()
export class RedisEventBus extends EventBus implements OnModuleDestroy {
  private readonly logger = new Logger(RedisEventBus.name);
  private readonly channel = 'madart:events';
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly handlers = new Set<EventHandler>();

  constructor(url: string) {
    super();
    this.pub = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    this.sub = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    void this.sub.subscribe(this.channel);
    this.sub.on('message', (_ch, message) => {
      let event: DomainEvent;
      try {
        event = JSON.parse(message) as DomainEvent;
      } catch {
        return;
      }
      for (const h of this.handlers) {
        Promise.resolve(h(event)).catch((err) => this.logger.error(`handler failed: ${(err as Error).message}`));
      }
    });
  }

  async publish(event: DomainEvent) {
    await this.pub.publish(this.channel, JSON.stringify(event));
  }

  subscribe(handler: EventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async ping(): Promise<boolean> {
    return (await this.pub.ping()) === 'PONG';
  }

  async onModuleDestroy() {
    this.pub.disconnect();
    this.sub.disconnect();
  }
}
