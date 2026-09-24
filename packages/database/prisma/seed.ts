/**
 * Seed: permissions, roles, one branch, stations, users, catalog, devices.
 * Idempotent – safe to run repeatedly. Device tokens are printed and written
 * to <repo>/.local/seed-output.json so the apps can be opened directly.
 *
 *   pnpm db:seed
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
loadEnv({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')] });

import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, RoleCode } from '@madart/domain';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { createPrismaClient } from '../src';
import { seedCategories, seedProducts, seedStations } from './seed-data/catalog';

const prisma = createPrismaClient();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me-please-32-chars';
/** Seed device tokens expire 2036-01-01 (dev only – production issues tokens from Admin). */
const SEED_TOKEN_EXP = Math.floor(Date.UTC(2036, 0, 1) / 1000);

const ROLE_NAMES: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrator',
  BRANCH_MANAGER: 'Branch Manager',
  CASHIER: 'Cashier',
  PRODUCTION_EMPLOYEE: 'Production Employee',
  DISPATCHER: 'Dispatcher',
};

/** SEED_PASSWORD overrides every demo password (use it on any public deployment). */
const pw = (dev: string) => process.env.SEED_PASSWORD ?? dev;
const USERS = [
  { email: 'admin@madart.local', password: pw('admin123'), displayName: 'ადმინი', roles: [RoleCode.SUPER_ADMIN] },
  { email: 'manager@madart.local', password: pw('manager123'), displayName: 'ფილიალის მენეჯერი', roles: [RoleCode.BRANCH_MANAGER] },
  { email: 'cashier@madart.local', password: pw('cashier123'), displayName: 'მოლარე ნინო', roles: [RoleCode.CASHIER], pin: '1234' },
  { email: 'kitchen@madart.local', password: pw('kitchen123'), displayName: 'მზარეული გიორგი', roles: [RoleCode.PRODUCTION_EMPLOYEE] },
  { email: 'dispatcher@madart.local', password: pw('dispatch123'), displayName: 'გამშვები ანა', roles: [RoleCode.DISPATCHER] },
];

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function main() {
  console.log('[seed] permissions & roles');
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const permissions = await prisma.permission.findMany();
  const permByCode = new Map(permissions.map((p) => [p.code, p.id]));

  for (const code of Object.values(RoleCode)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_NAMES[code] ?? code },
      create: { code, name: ROLE_NAMES[code] ?? code },
    });
    const existing = await prisma.rolePermission.count({ where: { roleId: role.id } });
    if (existing === 0) {
      await prisma.rolePermission.createMany({
        data: DEFAULT_ROLE_PERMISSIONS[code].map((p) => ({ roleId: role.id, permissionId: permByCode.get(p)! })),
        skipDuplicates: true,
      });
    }
  }

  console.log('[seed] branch');
  const branch = await prisma.branch.upsert({
    where: { code: 'SABURTALO' },
    update: {},
    create: {
      code: 'SABURTALO',
      name: 'MADART საბურთალო',
      address: 'თბილისი, ვაჟა-ფშაველას გამზ. 27',
      timeZone: 'Asia/Tbilisi',
      orderNumberPrefix: 'A',
      openingHours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { open: '09:00', close: '22:00' }])),
      pickupMinLeadMinutes: 30,
      pickupSlotMinutes: 15,
    },
  });

  console.log('[seed] stations');
  const stationByCode = new Map<string, string>();
  for (const s of seedStations) {
    const st = await prisma.productionStation.upsert({
      where: { branchId_code: { branchId: branch.id, code: s.code } },
      update: { name: s.name, color: s.color, sortOrder: s.sortOrder },
      create: { branchId: branch.id, ...s },
    });
    stationByCode.set(s.code, st.id);
  }

  console.log('[seed] users');
  const roles = await prisma.role.findMany();
  const roleByCode = new Map(roles.map((r) => [r.code, r.id]));
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { displayName: u.displayName, branchId: branch.id, pin: u.pin ?? null, ...(process.env.SEED_PASSWORD ? { passwordHash } : {}) },
      create: { email: u.email, passwordHash, displayName: u.displayName, branchId: branch.id, pin: u.pin ?? null },
    });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.createMany({ data: u.roles.map((code) => ({ userId: user.id, roleId: roleByCode.get(code)! })) });
  }

  console.log('[seed] catalog');
  const categoryByCode = new Map<string, string>();
  for (const c of seedCategories) {
    const cat = await prisma.category.upsert({
      where: { code: c.code },
      update: { nameKa: c.nameKa, nameEn: c.nameEn, nameRu: c.nameRu, sortOrder: c.sortOrder },
      create: { ...c },
    });
    categoryByCode.set(c.code, cat.id);
  }
  const productBySku = new Map<string, string>();
  for (const p of seedProducts) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { basePrice: p.price, imageUrl: p.imageUrl ?? null, categoryId: categoryByCode.get(p.category)! },
      create: {
        sku: p.sku,
        categoryId: categoryByCode.get(p.category)!,
        basePrice: p.price,
        imageUrl: p.imageUrl ?? null,
        availableMobile: p.availableMobile ?? true,
        translations: {
          create: [
            { locale: 'ka', name: p.nameKa, description: p.descriptionKa ?? null },
            { locale: 'en', name: p.nameEn, description: p.descriptionEn ?? null },
            { locale: 'ru', name: p.nameRu, description: null },
          ],
        },
      },
    });
    productBySku.set(p.sku, product.id);
    // Internal production config: only create when missing (never overwrite operator edits).
    await prisma.productProductionConfig.upsert({
      where: { productId: product.id },
      update: {},
      create: {
        productId: product.id,
        productionRequired: p.production.required,
        stationId: p.production.station ? stationByCode.get(p.production.station)! : null,
        productionTimeMinutes: p.production.minutes,
        preparationBufferMinutes: p.production.buffer ?? 0,
        capacityUnits: p.production.capacityUnits ?? 1,
      },
    });
    await prisma.productBranch.upsert({
      where: { productId_branchId: { productId: product.id, branchId: branch.id } },
      update: {},
      create: { productId: product.id, branchId: branch.id, available: true },
    });
  }
  for (const p of seedProducts) {
    for (const [i, sku] of (p.recommends ?? []).entries()) {
      const target = productBySku.get(sku);
      if (!target) continue;
      await prisma.productRecommendation.upsert({
        where: { productId_recommendedProductId: { productId: productBySku.get(p.sku)!, recommendedProductId: target } },
        update: { sortOrder: i },
        create: { productId: productBySku.get(p.sku)!, recommendedProductId: target, sortOrder: i },
      });
    }
  }

  console.log('[seed] devices');
  const devices = [
    { type: 'KIOSK' as const, name: 'Kiosk-01', station: null },
    { type: 'POS' as const, name: 'POS-01', station: null },
    { type: 'PRODUCTION' as const, name: 'Kitchen-Screen-01', station: 'HOT_KITCHEN' },
    { type: 'PRODUCTION' as const, name: 'Pastry-Screen-01', station: 'PASTRY' },
    { type: 'PRODUCTION' as const, name: 'Coffee-Screen-01', station: 'COFFEE' },
    { type: 'PRODUCTION' as const, name: 'Cake-Screen-01', station: 'CAKE' },
    { type: 'PRODUCTION' as const, name: 'Packaging-Screen-01', station: 'PACKAGING' },
    // one screen that shows every station of the branch (small kitchens / testing)
    { type: 'PRODUCTION' as const, name: 'Kitchen-All-01', station: null },
    { type: 'CUSTOMER_DISPLAY' as const, name: 'Display-01', station: null },
  ];
  const tokens: Record<string, string> = {};
  for (const d of devices) {
    const stationId = d.station ? stationByCode.get(d.station)! : null;
    let device = await prisma.device.findFirst({ where: { branchId: branch.id, name: d.name } });
    if (!device) {
      device = await prisma.device.create({
        data: { type: d.type, name: d.name, branchId: branch.id, stationId, tokenHash: `pending-${d.name}` },
      });
    }
    // Deterministic dev token so URLs stay stable across re-seeds (dev only!):
    // fixed `exp`, no `iat` → identical token (and hash) on every run.
    const token = jwt.sign(
      { kind: 'device', deviceType: d.type, branchId: branch.id, stationId, jti: `seed-${d.name}`, exp: SEED_TOKEN_EXP },
      JWT_SECRET,
      { subject: device.id, noTimestamp: true },
    );
    await prisma.device.update({ where: { id: device.id }, data: { tokenHash: hashToken(token), stationId } });
    tokens[d.name] = token;
  }

  console.log('[seed] settings');
  const settings: Record<string, unknown> = {
    'production.startingSoonMinutes': 5,
    'production.lateGraceMinutes': 2,
    'production.boardHorizonMinutes': 60,
    'payments.timeoutSeconds': 120,
    'payments.requirePaymentBeforeProduction': true,
    'display.readyRetentionMinutes': 30,
  };
  for (const [key, value] of Object.entries(settings)) {
    const existing = await prisma.systemSetting.findFirst({ where: { key, branchId: null } });
    if (!existing) await prisma.systemSetting.create({ data: { key, value: value as object } });
  }

  console.log('[seed] promotions');
  const promoCount = await prisma.promotion.count();
  if (promoCount === 0) {
    await prisma.promotion.createMany({
      data: [
        {
          branchId: null,
          kind: 'NEW_PRODUCT',
          badgeText: 'ახალი',
          titleKa: 'ახალი გემო: ხაჭაპური აჭარული',
          titleEn: 'New: Acharuli Khachapuri',
          subtitleKa: 'სცადეთ ჩვენი უახლესი შემატება',
          subtitleEn: 'Try our newest addition',
          imageUrl: 'https://madart.ge/thumb.php?img=product/926eb24094b9ea452ca63b80f2fea4ac.jpg&x=800&y=600&render=crop',
          sortOrder: 1,
        },
        {
          branchId: null,
          kind: 'DISCOUNT',
          badgeText: '-10%',
          titleKa: '−10% ტორტებზე შაბათ-კვირას',
          titleEn: '−10% off cakes on weekends',
          subtitleKa: 'შეკვეთა კიოსკზე ან მობილურით',
          subtitleEn: 'Order via kiosk or mobile',
          imageUrl: 'https://madart.ge/thumb.php?img=product/1c4c1d9688c77c8a3728d7a4c7e78b05.jpg&x=800&y=600&render=crop',
          sortOrder: 2,
        },
      ],
    });
  }

  const output = {
    branchId: branch.id,
    stations: Object.fromEntries(stationByCode),
    users: USERS.map((u) => ({ email: u.email, password: u.password, roles: u.roles })),
    deviceTokens: tokens,
    urls: {
      kiosk: `http://localhost:5173/?token=${tokens['Kiosk-01']}`,
      production_hot_kitchen: `http://localhost:5175/?token=${tokens['Kitchen-Screen-01']}`,
      production_pastry: `http://localhost:5175/?token=${tokens['Pastry-Screen-01']}`,
      production_coffee: `http://localhost:5175/?token=${tokens['Coffee-Screen-01']}`,
      production_cake: `http://localhost:5175/?token=${tokens['Cake-Screen-01']}`,
      production_packaging: `http://localhost:5175/?token=${tokens['Packaging-Screen-01']}`,
      production_all: `http://localhost:5175/?token=${tokens['Kitchen-All-01']}`,
      customer_display: `http://localhost:3003/?token=${tokens['Display-01']}`,
      pos: `http://localhost:5174/?token=${tokens['POS-01']}`,
    },
  };
  const outDir = path.resolve(process.cwd(), '../../.local');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'seed-output.json'), JSON.stringify(output, null, 2));

  console.log('\n[seed] done. Branch:', branch.id);
  console.log('[seed] users:', USERS.map((u) => `${u.email}/${u.password}`).join(', '));
  console.log('[seed] device URLs written to .local/seed-output.json');
  for (const [k, v] of Object.entries(output.urls)) console.log(`  ${k}: ${v}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
