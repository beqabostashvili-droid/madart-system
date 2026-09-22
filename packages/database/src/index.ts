import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './generated/client';

export * from './generated/client';
export { Prisma };

export interface CreatePrismaOptions {
  connectionString?: string;
  log?: ('query' | 'info' | 'warn' | 'error')[];
}

/** Creates a PrismaClient backed by the `pg` driver adapter (Prisma 7). */
export function createPrismaClient(options: CreatePrismaOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter, log: options.log ?? ['warn', 'error'] });
}

export type TransactionClient = Prisma.TransactionClient;
