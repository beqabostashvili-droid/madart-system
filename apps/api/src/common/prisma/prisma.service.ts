import { createPrismaClient, type PrismaClient } from '@madart/database';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { getEnv } from '../../config/env';

/**
 * Thin wrapper exposing a single PrismaClient. Services receive `PrismaService`
 * and call `this.prisma.client.<model>` or run `this.prisma.tx(async (tx) => …)`.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: PrismaClient;

  constructor() {
    const env = getEnv();
    this.client = createPrismaClient({
      connectionString: env.DATABASE_URL,
      log: env.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.client.$connect();
    this.logger.log('database connected');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  /** Interactive transaction with a sane timeout for critical operations. */
  tx<T>(fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>): Promise<T> {
    return this.client.$transaction(fn, { maxWait: 5000, timeout: 15000 });
  }

  async ping(): Promise<boolean> {
    await this.client.$queryRaw`SELECT 1`;
    return true;
  }
}
