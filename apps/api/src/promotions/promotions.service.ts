import type { Promotion } from '@madart/database';
import { localizedField } from '@madart/domain';
import type { AdminPromotionView, CreatePromotionBody, PromotionView, UpdatePromotionBody } from '@madart/types';
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toAdminView(p: Promotion): AdminPromotionView {
  return {
    id: p.id,
    branchId: p.branchId,
    kind: p.kind,
    badgeText: p.badgeText,
    titleKa: p.titleKa,
    titleEn: p.titleEn,
    titleRu: p.titleRu,
    subtitleKa: p.subtitleKa,
    subtitleEn: p.subtitleEn,
    subtitleRu: p.subtitleRu,
    imageUrl: p.imageUrl,
    linkProductId: p.linkProductId,
    active: p.active,
    sortOrder: p.sortOrder,
    startsAt: iso(p.startsAt),
    endsAt: iso(p.endsAt),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function toPublicView(p: Promotion, locale: 'ka' | 'en' | 'ru'): PromotionView {
  return {
    id: p.id,
    branchId: p.branchId,
    kind: p.kind,
    badgeText: p.badgeText,
    title: localizedField({ nameKa: p.titleKa, nameEn: p.titleEn, nameRu: p.titleRu }, locale),
    subtitle: p.subtitleKa ? localizedField({ nameKa: p.subtitleKa, nameEn: p.subtitleEn, nameRu: p.subtitleRu }, locale) : null,
    imageUrl: p.imageUrl,
    linkProductId: p.linkProductId,
    active: p.active,
    sortOrder: p.sortOrder,
    startsAt: iso(p.startsAt),
    endsAt: iso(p.endsAt),
  };
}

/**
 * Kiosk / mobile promo & news banner service. Not part of the original
 * specification — added for in-store advertising and announcements. A
 * promotion applies to one branch, or every branch when `branchId` is null.
 * Active window is [startsAt, endsAt), both optional (open-ended if unset).
 */
@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public/device-facing: currently active promotions for a branch, in display order. */
  async active(branchId: string, locale: 'ka' | 'en' | 'ru'): Promise<PromotionView[]> {
    const now = new Date();
    const rows = await this.prisma.client.promotion.findMany({
      where: {
        active: true,
        OR: [{ branchId }, { branchId: null }],
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((p) => toPublicView(p, locale));
  }

  async listAdmin(branchId?: string): Promise<AdminPromotionView[]> {
    const rows = await this.prisma.client.promotion.findMany({
      where: branchId ? { OR: [{ branchId }, { branchId: null }] } : {},
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toAdminView);
  }

  async get(id: string): Promise<AdminPromotionView> {
    const p = await this.prisma.client.promotion.findUnique({ where: { id } });
    if (!p) throw new NotFoundError('Promotion', id);
    return toAdminView(p);
  }

  async create(body: CreatePromotionBody): Promise<AdminPromotionView> {
    const p = await this.prisma.client.promotion.create({
      data: {
        branchId: body.branchId ?? null,
        kind: body.kind,
        badgeText: body.badgeText ?? null,
        titleKa: body.titleKa,
        titleEn: body.titleEn ?? null,
        titleRu: body.titleRu ?? null,
        subtitleKa: body.subtitleKa ?? null,
        subtitleEn: body.subtitleEn ?? null,
        subtitleRu: body.subtitleRu ?? null,
        imageUrl: body.imageUrl,
        linkProductId: body.linkProductId ?? null,
        active: body.active,
        sortOrder: body.sortOrder,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      },
    });
    return toAdminView(p);
  }

  async update(id: string, body: UpdatePromotionBody): Promise<AdminPromotionView> {
    await this.get(id);
    const p = await this.prisma.client.promotion.update({
      where: { id },
      data: {
        ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.badgeText !== undefined ? { badgeText: body.badgeText } : {}),
        ...(body.titleKa !== undefined ? { titleKa: body.titleKa } : {}),
        ...(body.titleEn !== undefined ? { titleEn: body.titleEn } : {}),
        ...(body.titleRu !== undefined ? { titleRu: body.titleRu } : {}),
        ...(body.subtitleKa !== undefined ? { subtitleKa: body.subtitleKa } : {}),
        ...(body.subtitleEn !== undefined ? { subtitleEn: body.subtitleEn } : {}),
        ...(body.subtitleRu !== undefined ? { subtitleRu: body.subtitleRu } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
        ...(body.linkProductId !== undefined ? { linkProductId: body.linkProductId } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt ? new Date(body.startsAt) : null } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? new Date(body.endsAt) : null } : {}),
      },
    });
    return toAdminView(p);
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.prisma.client.promotion.delete({ where: { id } });
  }
}
