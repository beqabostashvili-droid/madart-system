/**
 * Clears all OPERATIONAL data so a demo/test run starts from zero:
 * orders, items, payments, refunds, production tasks/steps, status histories,
 * audit logs, idempotency keys, order-number sequences (next order is A001),
 * catalog-import history, plus artefacts left by the API e2e tests
 * (products with test SKUs, devices named Test-… or Pay-…).
 *
 * Keeps: branches, stations, users/roles, devices from the seed, categories,
 * products (seeded + imported), production configs, settings.
 *
 *   pnpm db:clean
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
loadEnv({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')] });

import { createPrismaClient } from '../src';

const prisma = createPrismaClient();

async function main() {
  const before = await prisma.order.count();
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.paymentStatusHistory.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.productionStep.deleteMany(),
    prisma.productionTask.deleteMany(),
    prisma.orderItemModifier.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.order.deleteMany(),
    prisma.orderNumberSequence.deleteMany(),
    prisma.idempotencyKey.deleteMany(),
    prisma.catalogImportItem.deleteMany(),
    prisma.catalogImport.deleteMany(),
  ]);

  // e2e test artefacts
  const testProducts = await prisma.product.deleteMany({ where: { sku: { startsWith: 'T-' } } });
  const testProducts2 = await prisma.product.deleteMany({ where: { sku: { startsWith: 'P-' } } });
  const testDevices = await prisma.device.deleteMany({ where: { OR: [{ name: { startsWith: 'Test-' } }, { name: { startsWith: 'Pay-' } }] } });

  const [orders, products, devices, users] = await Promise.all([prisma.order.count(), prisma.product.count(), prisma.device.count(), prisma.user.count()]);
  console.log(`[clean] removed ${before} orders (+ payments, tasks, history, audit); test products: ${testProducts.count + testProducts2.count}; test devices: ${testDevices.count}`);
  console.log(`[clean] now: orders=${orders} products=${products} devices=${devices} users=${users}; next order number starts at 001`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
