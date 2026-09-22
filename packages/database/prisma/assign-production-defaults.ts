/**
 * One-off / repair: gives imported products that still have "no production"
 * the category-based defaults (ASSUMPTION A-22). Safe to re-run.
 *   pnpm --filter @madart/database exec tsx prisma/assign-production-defaults.ts
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
loadEnv({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')] });
import { createPrismaClient } from '../src';

const DEFAULTS: Record<string, { station: string; minutes: number; buffer?: number; capacityUnits?: number }> = {
  KHACHAPURI: { station: 'HOT_KITCHEN', minutes: 30 },
  LOBIANI: { station: 'HOT_KITCHEN', minutes: 10 },
  BAKERY: { station: 'HOT_KITCHEN', minutes: 15 },
  CAKES: { station: 'CAKE', minutes: 20, buffer: 5, capacityUnits: 4 },
  PASTRIES: { station: 'PASTRY', minutes: 3 },
  ECLAIRS: { station: 'PASTRY', minutes: 2 },
  CHOUX: { station: 'PASTRY', minutes: 2 },
  BOXES: { station: 'PACKAGING', minutes: 8, capacityUnits: 2 },
};
// the snapshot import created categories from Georgian names; map those codes too
const CODE_ALIASES: Record<string, string> = { 'ცხობა': 'BAKERY', 'ბოქსები': 'BOXES' };

const prisma = createPrismaClient();
async function main() {
  const branch = await prisma.branch.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  if (!branch) throw new Error('no branch');
  const stations = new Map((await prisma.productionStation.findMany({ where: { branchId: branch.id } })).map((s) => [s.code, s.id]));
  const products = await prisma.product.findMany({ where: { externalSource: { not: null } }, include: { category: true, productionConfig: true } });
  let updated = 0;
  for (const p of products) {
    const cfg = p.productionConfig;
    if (cfg && cfg.productionRequired) continue; // operator already configured
    const code = CODE_ALIASES[p.category.code] ?? CODE_ALIASES[p.category.nameKa] ?? p.category.code;
    const d = DEFAULTS[code];
    const stationId = d ? stations.get(d.station) : undefined;
    if (!d || !stationId) continue;
    await prisma.productProductionConfig.upsert({
      where: { productId: p.id },
      update: { productionRequired: true, stationId, productionTimeMinutes: d.minutes, preparationBufferMinutes: d.buffer ?? 0, capacityUnits: d.capacityUnits ?? 1 },
      create: { productId: p.id, productionRequired: true, stationId, productionTimeMinutes: d.minutes, preparationBufferMinutes: d.buffer ?? 0, capacityUnits: d.capacityUnits ?? 1 },
    });
    updated++;
  }
  const cats = await prisma.category.findMany({ select: { code: true, nameKa: true } });
  console.log('[defaults] categories:', cats.map((c) => `${c.code}(${c.nameKa})`).join(', '));
  console.log(`[defaults] updated ${updated} imported products with production defaults`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
