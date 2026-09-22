import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const SETTING_DEFAULTS = {
  'production.startingSoonMinutes': 5,
  'production.lateGraceMinutes': 2,
  'production.boardHorizonMinutes': 60,
  'production.readyRetentionMinutes': 15,
  'payments.timeoutSeconds': 120,
  'payments.requirePaymentBeforeProduction': true,
  'display.readyRetentionMinutes': 30,
  'orders.numberPadding': 3,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/**
 * System settings with branch override and a short in-memory cache.
 * Resolution: branch value → global value → code default.
 */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; at: number }>();
  private readonly ttlMs = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K, branchId?: string | null): Promise<(typeof SETTING_DEFAULTS)[K]> {
    const cacheKey = `${key}:${branchId ?? ''}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as (typeof SETTING_DEFAULTS)[K];

    const rows = await this.prisma.client.systemSetting.findMany({
      where: { key, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] },
    });
    const branchRow = branchId ? rows.find((r) => r.branchId === branchId) : undefined;
    const globalRow = rows.find((r) => r.branchId === null);
    const value = (branchRow?.value ?? globalRow?.value ?? SETTING_DEFAULTS[key]) as (typeof SETTING_DEFAULTS)[K];
    this.cache.set(cacheKey, { value, at: Date.now() });
    return value;
  }

  async productionThresholds(branchId?: string | null) {
    const [startingSoonMinutes, lateGraceMinutes, boardHorizonMinutes] = await Promise.all([
      this.get('production.startingSoonMinutes', branchId),
      this.get('production.lateGraceMinutes', branchId),
      this.get('production.boardHorizonMinutes', branchId),
    ]);
    return { startingSoonMinutes, lateGraceMinutes, boardHorizonMinutes };
  }

  async list(branchId?: string | null) {
    return this.prisma.client.systemSetting.findMany({
      where: branchId ? { OR: [{ branchId: null }, { branchId }] } : {},
      orderBy: { key: 'asc' },
    });
  }

  async upsert(key: string, value: unknown, branchId: string | null) {
    const existing = await this.prisma.client.systemSetting.findFirst({ where: { key, branchId } });
    const row = existing
      ? await this.prisma.client.systemSetting.update({ where: { id: existing.id }, data: { value: value as object } })
      : await this.prisma.client.systemSetting.create({ data: { key, value: value as object, branchId } });
    this.cache.clear();
    return row;
  }
}
